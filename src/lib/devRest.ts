/**
 * Dev 模式 renderer 直连分发器。
 *
 * 背景：生产模式下所有云端请求经主进程 IPC 发出，renderer DevTools 的
 * Network 面板抓不到包，调试困难。Dev 模式下，纯 REST 命令（cloud_* /
 * auth REST / market 浏览 / review 提交）改由 renderer 直接发 fetch——
 * DevTools Network 可见；有状态命令（token/账号/outbox 存储、api_env、
 * 文件对话框）仍走 IPC 回退。
 *
 * base 解析：MEMFLOW_API_BASE localStorage 覆盖 > dev 默认 http://localhost:8080。
 * 仅 vite dev 生效（import.meta.env.DEV），生产构建不打包本模块逻辑。
 */
import { setApiBaseOverride, api, ApiHttpError } from "../../electron/http";
import * as cloud from "../../electron/cloud";
import * as market from "../../electron/market";
import * as auth from "../../electron/auth";
import { listMarketplacePlugins } from "../../electron/marketplaceApi";
import { createScheduler, type ReviewEvent, type ReviewInput } from "@nssai/scheduler";

const STORAGE_BASE = "memflow_api_base";
const DEV_DEFAULT_BASE = "http://localhost:8080";

export function resolveDevBase(): string {
  return localStorage.getItem(STORAGE_BASE) ?? DEV_DEFAULT_BASE;
}

setApiBaseOverride(resolveDevBase());

/** 渲染进程侧 outbox 写入（write-ahead 语义，经 IPC 落主进程 SQLite） */
async function ipc(cmd: string, args: Record<string, unknown>): Promise<never> {
  const bridge = window.memflowInvoke;
  if (!bridge) throw new Error("IPC bridge 未初始化");
  return bridge(cmd, args) as Promise<never>;
}

/** POST /api/review 提交（对齐 electron/review.ts 的 trySubmit 协议） */
async function trySubmitDirect(
  token: string,
  event: ReviewEvent,
  parameters?: number[],
  desiredRetention?: number
): Promise<unknown> {
  const build = (base: ReviewInput) => {
    const scheduler = createScheduler({ weights: parameters, retention: desiredRetention });
    const computed = scheduler.computeReview(base, event.rating, event.elapsed_ms, {
      reviewTime: new Date(event.reviewed_at),
      retention: desiredRetention,
    });
    return {
      review_id: event.review_id,
      card_id: event.card_id,
      cloze_num: event.cloze_num ?? 0,
      base_version: base.version,
      stability: computed.stability,
      difficulty: computed.difficulty,
      reps: computed.reps,
      lapses: computed.lapses,
      state: computed.state,
      rating: event.rating,
      elapsed_ms: event.elapsed_ms,
      elapsed_days: computed.elapsed_days,
      scheduled_days: computed.scheduled_days,
      reviewed_at: event.reviewed_at,
      due: computed.due,
    };
  };
  const post = (body: unknown) =>
    api.post<unknown>("/api/review", body, token).catch((e) => {
      if (e instanceof ApiHttpError && e.status === 409) return e.body as Record<string, unknown>;
      throw e;
    });
  const first = (await post(build(event.base))) as Record<string, unknown>;
  if (first.card_id && first.version !== undefined && first.due) return first; // 200 权威状态
  // 409：响应携带权威状态，基于它重算再提交一次
  const fresh = first as unknown as Parameters<typeof build>[0];
  const second = (await post(build(fresh))) as Record<string, unknown>;
  if (second.card_id && second.version !== undefined) return second;
  throw new Error("反复版本冲突，留待下次重放");
}

const str = (v: unknown): string => v as string;
const optStr = (v: unknown): string | undefined => (v == null ? undefined : (v as string));

/** 功能插件 → 其 dev 直连命令的归属映射（禁用后应与主进程一致地"未知命令"） */
const PLUGIN_COMMANDS: Record<string, string> = {
  market_list_decks: "com.memflow.market",
  market_get_deck: "com.memflow.market",
  market_preview: "com.memflow.market",
};

let enabledCache: Set<string> | null = null;
async function ensureEnabled(): Promise<Set<string>> {
  if (enabledCache) return enabledCache;
  const bridge = window.memflowInvoke;
  if (!bridge) return new Set();
  try {
    const list = (await bridge("list_plugins")) as { name: string; enabled: boolean }[];
    enabledCache = new Set(list.filter((p) => p.enabled).map((p) => p.name));
  } catch {
    enabledCache = new Set(); // 保守：拿不到列表时不放行归属命令
  }
  return enabledCache;
}

export function invalidatePluginCache(): void {
  enabledCache = null;
}

/** 纯 REST 命令表：命中则由 renderer 直连；未命中返回 undefined 走 IPC */
const restHandlers: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {
  // auth（REST 部分）
  auth_request_qr: () => auth.authRequestQr(),
  auth_poll_qr: (a) => auth.authPollQr(str(a.qr_id)),
  auth_email_login: (a) => auth.authEmailLogin(str(a.email), str(a.password)),
  auth_bind_email: (a) => auth.authBindEmail(str(a.token), str(a.email), str(a.password)),
  auth_get_profile: (a) => auth.authGetProfile(str(a.token)),

  // cloud 全量
  cloud_list_decks: (a) => cloud.cloudListDecks(str(a.token)),
  cloud_create_deck: (a) => cloud.cloudCreateDeck(str(a.token), str(a.name), optStr(a.description), optStr(a.group_id)),
  cloud_update_deck: (a) =>
    cloud.cloudUpdateDeck(str(a.token), str(a.id), str(a.name), optStr(a.description), optStr(a.group_id), a.suspended as boolean | undefined),
  cloud_delete_deck: (a) => cloud.cloudDeleteDeck(str(a.token), str(a.id)),
  cloud_list_cards: (a) =>
    cloud.cloudListCards(str(a.token), {
      deck_id: optStr(a.deck_id),
      keyword: optStr(a.keyword),
      tag: a.tag as string[] | undefined,
      page: a.page as number | undefined,
      page_size: a.page_size as number | undefined,
    }),
  cloud_create_card: (a) =>
    cloud.cloudCreateCard(str(a.token), str(a.deck_id), str(a.front), str(a.back), optStr(a.card_type), (a.tags as string[]) ?? undefined, a.cloze_nums as number[] | undefined),
  cloud_update_card: (a) =>
    cloud.cloudUpdateCard(str(a.token), str(a.id), optStr(a.deck_id), str(a.front), str(a.back), str(a.card_type), (a.tags as string[]) ?? undefined, a.cloze_nums as number[] | undefined),
  cloud_delete_card: (a) => cloud.cloudDeleteCard(str(a.token), str(a.id)),
  cloud_list_tags: (a) => cloud.cloudListTags(str(a.token), optStr(a.keyword)),
  cloud_rename_tag: (a) => cloud.cloudRenameTag(str(a.token), str(a.id), str(a.name)),
  cloud_delete_tag: (a) => cloud.cloudDeleteTag(str(a.token), str(a.id)),
  cloud_list_groups: (a) => cloud.cloudListGroups(str(a.token)),
  cloud_create_group: (a) => cloud.cloudCreateGroup(str(a.token), str(a.name), optStr(a.description), optStr(a.icon), optStr(a.parent_id)),
  cloud_update_group: (a) => cloud.cloudUpdateGroup(str(a.token), str(a.id), str(a.name), optStr(a.description), optStr(a.icon), optStr(a.parent_id)),
  cloud_delete_group: (a) => cloud.cloudDeleteGroup(str(a.token), str(a.id)),
  cloud_get_review_queue: (a) => cloud.cloudGetReviewQueue(str(a.token), optStr(a.deck_id)),
  cloud_get_today_stats: (a) => cloud.cloudGetTodayStats(str(a.token)),
  cloud_get_stats: (a) => cloud.cloudGetStats(str(a.token), optStr(a.deck_id)),
  cloud_get_review_settings: (a) => cloud.cloudGetReviewSettings(str(a.token)),
  cloud_update_review_settings: (a) => cloud.cloudUpdateReviewSettings(str(a.token), a.settings as Record<string, unknown>),

  // 插件市场（公开浏览；安装涉文件落盘走 IPC）
  marketplace_list: (a) => listMarketplacePlugins(optStr(a.keyword), (a.page as number | undefined) ?? 1),

  // market 浏览（购买/导入涉及订单状态与本地落库，走 IPC 保持单实现）
  market_list_decks: (a) =>
    market.marketListDecks(str(a.token), {
      category: optStr(a.category),
      keyword: optStr(a.keyword),
      pricing_type: optStr(a.pricing_type),
      sort: optStr(a.sort) ?? "sales",
      page: (a.page as number) ?? 1,
    }),
  market_get_deck: (a) => market.marketGetDeck(str(a.token), str(a.id)),
  market_preview: (a) => market.marketPreview(str(a.token), str(a.id)),

  // review（write-ahead 经 IPC 落 outbox，HTTP 直连可见）
  submit_review: async (a) => {
    const event = a.event as ReviewEvent;
    await ipc("outbox_enqueue", { event, user_id: str(a.user_id) });
    try {
      const resp = await trySubmitDirect(str(a.token), event, a.parameters as number[] | undefined, a.desired_retention as number | undefined);
      await ipc("outbox_dequeue", { review_id: event.review_id });
      return resp;
    } catch (e) {
      if (e instanceof ApiHttpError && e.status >= 400 && e.status < 500 && e.status !== 409) {
        await ipc("outbox_dequeue", { review_id: event.review_id }); // 毒消息丢弃
        throw new Error(`评分已丢弃: ${(e.body as { error?: string })?.error ?? e.message}`);
      }
      if (e instanceof ApiHttpError) throw new Error(`已保存到离线队列（HTTP ${e.status}）`);
      throw new Error(`已保存到离线队列（${String(e)}）`);
    }
  },
};

/**
 * devInvoke：dev 模式入口。命中 REST 表 → renderer 直连（console 标注 [rest]）；
 * 否则 → IPC（[ipc]）。未登录态等存储命令自然落到 IPC。
 *
 * 参数归一化：渲染端按 Tauri v2 约定传 camelCase，生产路径由
 * electron/ipc.ts 的 dispatch() 统一转 snake_case；restHandlers 同样读
 * snake_case 键，因此这里必须先做同样的归一化，否则 dev 下全链路
 * undefined（典型：auth_poll_qr 轮询 /qr/state/undefined）。
 */
function camelToSnakeKey(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) out[camelToSnakeKey(k)] = v;
  return out;
}

export async function devInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const norm = normalizeArgs(args ?? {});
  // 插件管理命令会改变启停状态，透传后失效缓存
  if (cmd === "list_plugins" || cmd === "set_plugin_enabled") {
    invalidatePluginCache();
    return window.memflowInvoke!<T>(cmd, norm);
  }
  const handler = restHandlers[cmd];
  if (handler) {
    const owner = PLUGIN_COMMANDS[cmd];
    if (owner && !(await ensureEnabled()).has(owner)) {
      throw new Error(`未知命令: ${cmd}`);
    }
    console.debug(`[rest] ${cmd}`, norm);
    return (await handler(norm)) as T;
  }
  console.debug(`[ipc] ${cmd}`);
  return window.memflowInvoke!<T>(cmd, norm);
}
