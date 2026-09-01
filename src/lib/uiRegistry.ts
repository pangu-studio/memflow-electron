/**
 * UI Registry（renderer）：贡献点表（zustand store）。
 *
 * 启动时经 get_contributions 拉全量，之后经 preload 事件桥
 * （memflowOnEvent）增量刷新——插件启停即时反映到路由/导航。
 * 主进程侧聚合见 electron/core/runtime.ts contributions()。
 */
import { create } from "zustand";
import { invoke } from "./invoke";
import { EVENT_CONTRIBUTIONS_CHANGED } from "../../electron/core/events";
import type { ContributionPoint, Contributions } from "../../packages/plugin-api/src/index";

export type ContributionTable = Record<ContributionPoint, unknown[]>;

const EMPTY_TABLE: ContributionTable = {
  commands: [],
  commandPalette: [],
  navigation: [],
  settingsPages: [],
  cardRenderers: [],
  reviewActions: [],
  deckSources: [],
};

interface UIRegistryState {
  table: ContributionTable;
  loaded: boolean;
  refresh: () => Promise<void>;
}

/** 插件路由映射：route → 归属插件（route 收敛依据） */
export const PLUGIN_ROUTES: Record<string, string> = {
  "/market": "com.memflow.market",
  "/stats": "com.memflow.stats",
  "/membership": "com.memflow.membership",
  "/wallet": "com.memflow.membership",
};

let subscribed = false;

export const useUIRegistry = create<UIRegistryState>()((set) => ({
  table: EMPTY_TABLE,
  loaded: false,
  refresh: async () => {
    const table = (await invoke<ContributionTable>("get_contributions")) ?? EMPTY_TABLE;
    set({ table, loaded: true });
  },
}));

/** 启动 UI Registry：全量拉取 + 订阅增量事件（幂等） */
export function initUIRegistry(): void {
  if (subscribed) return;
  subscribed = true;
  void useUIRegistry.getState().refresh();
  const bridge = (
    window as unknown as { memflowOnEvent?: (h: (msg: { name: string; payload: unknown }) => void) => void }
  ).memflowOnEvent;
  bridge?.((msg) => {
    if (msg.name === EVENT_CONTRIBUTIONS_CHANGED) {
      useUIRegistry.setState({ table: (msg.payload as ContributionTable) ?? EMPTY_TABLE, loaded: true });
    }
  });
}

/** 某插件路由当前是否可用（其导航贡献点存在） */
export function isPluginRouteAvailable(route: string): boolean {
  const plugin = PLUGIN_ROUTES[route];
  if (!plugin) return true; // 核心路由不受插件管理
  const nav = useUIRegistry.getState().table.navigation as Contributions["navigation"];
  return (nav ?? []).some((n) => n.id === plugin.split(".").pop() || route === n.route);
}
