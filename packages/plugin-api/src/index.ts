/**
 * @nssai/plugin-api — MemFlow 插件契约类型（manifest v1 + 贡献点 + 权限）。
 *
 * 零依赖；主进程（插件运行时/CommandRegistry）与 renderer（UI Registry）
 * 共用同一份类型定义，保证贡献点协议两端一致。
 * 设计文档：docs/design/cordis-plugin-architecture.md §5
 */

// ============================================================================
// 权限
// ============================================================================

/**
 * 插件权限声明。Phase 2 内置插件全量授予（完全信任）；Phase 3 外部插件
 * 由运行时按此白名单强制执行。
 */
export type PluginPermission =
  | "network" // 任意出站请求
  | "cloud.read" // 读当前用户云端数据（经 memflow.cloud 服务）
  | "cloud.write" // 写当前用户云端数据
  | "storage" // 本地 KV / outbox
  | "scheduler" // FSRS 调度计算（@nssai/scheduler）
  | "ui"; // 注册贡献点（默认隐含，无需声明）

// ============================================================================
// 贡献点
// ============================================================================

export interface CommandContribution {
  /** snake_case，与既有 IPC/Tauri 命令命名风格一致 */
  name: string;
  description?: string;
}

export interface CommandPaletteContribution {
  id: string;
  title: string;
  /** 触发动作（命令名或插件自定义 action，经 commandPalette:run 分发） */
  action: string;
  shortcutHint?: string;
}

export interface NavigationContribution {
  id: string;
  title: string;
  /** HashRouter 路由，如 /market */
  route: string;
  icon?: string;
}

export interface SettingsPageContribution {
  id: string;
  title: string;
  /** renderer 插件模块的导出名（PluginSlot 懒加载） */
  component: string;
}

export interface CardRendererContribution {
  id: string;
  /** 匹配规则（markdown 扩展名/frontmatter 键），核心渲染兜底 */
  match: string;
  component: string;
}

export interface ReviewActionContribution {
  id: string;
  title: string;
  component: string;
}

export interface DeckSourceContribution {
  id: string;
  title: string;
}

export interface Contributions {
  commands?: CommandContribution[];
  commandPalette?: CommandPaletteContribution[];
  navigation?: NavigationContribution[];
  settingsPages?: SettingsPageContribution[];
  cardRenderers?: CardRendererContribution[];
  reviewActions?: ReviewActionContribution[];
  deckSources?: DeckSourceContribution[];
}

/** 贡献点键名常量（避免字符串漂移） */
export const CONTRIBUTION_POINTS = [
  "commands",
  "commandPalette",
  "navigation",
  "settingsPages",
  "cardRenderers",
  "reviewActions",
  "deckSources",
] as const;

export type ContributionPoint = (typeof CONTRIBUTION_POINTS)[number];

// ============================================================================
// Manifest
// ============================================================================

export interface PluginManifest {
  /** 反域名唯一标识，如 com.memflow.market */
  name: string;
  version: string;
  displayName: string;
  description?: string;
  /** main 插件入口（Node，主进程加载）；缺省 = 纯 UI 插件 */
  main?: string;
  /** renderer 入口（React 组件模块，UI Registry 懒加载） */
  renderer?: string;
  /** 依赖的其他服务名（依赖驱动加载；服务未就绪时插件等待） */
  inject?: string[];
  contributes?: Contributions;
  permissions?: PluginPermission[];
  /** 未在 plugins.json 中显式配置时是否默认启用（默认 true） */
  defaultEnabled?: boolean;
  /** 恒启用、不可禁用（仅核心插件应设置） */
  core?: boolean;
}

// ============================================================================
// 校验（零依赖轻量实现，错误信息带字段路径）
// ============================================================================

class ManifestError extends Error {}

const NAME_RE = /^[a-z0-9][a-z0-9.-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+/;
const PERMISSIONS: PluginPermission[] = [
  "network",
  "cloud.read",
  "cloud.write",
  "storage",
  "scheduler",
  "ui",
];

function fail(path: string, msg: string): never {
  throw new ManifestError(`manifest.${path}: ${msg}`);
}

function reqStr(m: Record<string, unknown>, key: string, path: string): string {
  const v = m[key];
  if (typeof v !== "string" || v.length === 0) fail(path + key, "非空字符串 required");
  return v as string;
}

function optStr(m: Record<string, unknown>, key: string): string | undefined {
  const v = m[key];
  return v === undefined ? undefined : (v as string);
}

function reqArray<T>(v: unknown, path: string, item: (x: unknown, p: string) => T): T[] {
  if (!Array.isArray(v)) fail(path, "数组 required");
  return v.map((x, i) => item(x, `${path}[${i}].`));
}

function reqRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "对象 required");
  return v as Record<string, unknown>;
}

function optRecord(v: unknown, path: string): Record<string, unknown> | undefined {
  return v === undefined ? undefined : reqRecord(v, path);
}

/** 校验并归一化 manifest；非法时抛 Error（message 带字段路径） */
export function validateManifest(input: unknown): PluginManifest {
  const m = reqRecord(input, "");
  const name = reqStr(m, "name", "");
  if (!NAME_RE.test(name)) fail("name", "反域名格式（小写字母/数字/./-）");
  const version = reqStr(m, "version", "");
  if (!VERSION_RE.test(version)) fail("version", "semver 格式");
  const displayName = reqStr(m, "displayName", "");

  const manifest: PluginManifest = {
    name,
    version,
    displayName,
    description: optStr(m, "description"),
    main: optStr(m, "main"),
    renderer: optStr(m, "renderer"),
    inject: m.inject === undefined ? undefined : reqArray(m.inject, "inject", (x, p) => {
      if (typeof x !== "string" || x.length === 0) fail(p, "服务名非空字符串");
      return x as string;
    }),
    defaultEnabled: m.defaultEnabled === undefined ? undefined : Boolean(m.defaultEnabled),
    core: m.core === undefined ? undefined : Boolean(m.core),
  };

  if (m.permissions !== undefined) {
    manifest.permissions = reqArray(m.permissions, "permissions", (x, p) => {
      if (typeof x !== "string" || !(PERMISSIONS as string[]).includes(x as string)) {
        fail(p, `未知权限（可选 ${PERMISSIONS.join("/")}）`);
      }
      return x as PluginPermission;
    });
  }

  const c = optRecord(m.contributes, "contributes");
  if (c) {
    const contributes: Contributions = {};
    if (c.commands !== undefined) {
      contributes.commands = reqArray(c.commands, "contributes.commands", (x, p) => {
        const o = reqRecord(x, p);
        const cn = reqStr(o, "name", p);
        if (!/^[a-z][a-z0-9_]*$/.test(cn)) fail(p + "name", "snake_case 命令名");
        return { name: cn, description: optStr(o, "description") };
      });
    }
    const itemWithComponent = (path: string, extra: (o: Record<string, unknown>, p: string) => Record<string, unknown>) =>
      (x: unknown, p: string) => {
        const o = reqRecord(x, p);
        const id = reqStr(o, "id", p);
        const title = reqStr(o, "title", p);
        const component = reqStr(o, "component", p);
        return { id, title, component, ...extra(o, p) };
      };
    if (c.commandPalette !== undefined) {
      contributes.commandPalette = reqArray(c.commandPalette, "contributes.commandPalette", (x, p) => {
        const o = reqRecord(x, p);
        return {
          id: reqStr(o, "id", p),
          title: reqStr(o, "title", p),
          action: reqStr(o, "action", p),
          shortcutHint: optStr(o, "shortcutHint"),
        };
      });
    }
    if (c.navigation !== undefined) {
      contributes.navigation = reqArray(c.navigation, "contributes.navigation", (x, p) => {
        const o = reqRecord(x, p);
        const route = reqStr(o, "route", p);
        if (!route.startsWith("/")) fail(p + "route", "须以 / 开头");
        return { id: reqStr(o, "id", p), title: reqStr(o, "title", p), route, icon: optStr(o, "icon") };
      });
    }
    if (c.settingsPages !== undefined) {
      contributes.settingsPages = reqArray(c.settingsPages, "contributes.settingsPages", itemWithComponent("settingsPages", () => ({})));
    }
    if (c.cardRenderers !== undefined) {
      contributes.cardRenderers = reqArray(c.cardRenderers, "contributes.cardRenderers", (x, p) => {
        const o = reqRecord(x, p);
        return {
          id: reqStr(o, "id", p),
          match: reqStr(o, "match", p),
          component: reqStr(o, "component", p),
        };
      });
    }
    if (c.reviewActions !== undefined) {
      contributes.reviewActions = reqArray(c.reviewActions, "contributes.reviewActions", itemWithComponent("reviewActions", () => ({})));
    }
    if (c.deckSources !== undefined) {
      contributes.deckSources = reqArray(c.deckSources, "contributes.deckSources", (x, p) => {
        const o = reqRecord(x, p);
        return { id: reqStr(o, "id", p), title: reqStr(o, "title", p) };
      });
    }
    manifest.contributes = contributes;
  }

  return manifest;
}
