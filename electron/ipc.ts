/**
 * IPC 命令注册表：命令名与 Tauri 契约完全一致（snake_case），
 * 前端经 preload 桥 invoke("cmd", args) 到达这里。
 * 参数解包与前端调用处及 Rust command 签名一一对应（显式注册）。
 */
import { app, dialog, BrowserWindow } from "electron";
import { createRuntime, type RootRuntime } from "./core/runtime";
import fs from "node:fs";
import { createScheduler } from "@nssai/scheduler";
import * as config from "./config";
import * as auth from "./auth";
import * as review from "./review";
import * as cloud from "./cloud";
import * as cli from "./cli";
import { initFeaturePlugins, listPlugins, setPluginEnabledCommand } from "./plugins";

type Handler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

/** cloud_export_deck：云端拉取（base64）+ 系统保存对话框 + 写文件，返回保存路径（取消返回 ""） */
async function exportDeckWithDialog(args: Record<string, unknown>): Promise<string> {
  const resp = await cloud.cloudExportDeck(args.token as string, args.id as string);
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const result = await dialog.showSaveDialog(win!, {
    defaultPath: resp.file_name ?? "deck.mfdeck",
    filters: [{ name: "MemFlow Deck", extensions: ["mfdeck"] }],
  });
  if (result.canceled || !result.filePath) return "";
  fs.writeFileSync(result.filePath, Buffer.from(resp.data, "base64"));
  return result.filePath;
}

function getApiEnv() {
  return {
    build_profile: config.isPackaged() ? "release" : "debug",
    can_switch: config.isPackaged(),
    available: config.builtinEnvironments(),
  };
}

function setApiEnv(args: Record<string, unknown>): void {
  if (!config.isPackaged()) throw new Error("此功能仅在发布版可用");
  config.saveOverride(args.env as string, args.custom_url as string | undefined);
}

/** review_card：纯 FSRS 计算（评分按钮间隔预览；提交走 submit_review） */
function reviewCard(args: Record<string, unknown>) {
  const s = args.state as {
    card_id: string;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    state: number;
    last_review?: string;
  };
  const retention = (args.desired_retention as number | undefined) ?? 0.9;
  const scheduler = createScheduler({
    weights: args.parameters as number[] | undefined,
    retention,
  });
  const computed = scheduler.computeReview(
    {
      card_id: s.card_id,
      stability: s.stability,
      difficulty: s.difficulty,
      reps: s.reps,
      lapses: s.lapses,
      state: s.state,
      version: 0,
      last_review: s.last_review,
    },
    args.rating as number,
    0,
    { retention }
  );
  return {
    card_id: s.card_id,
    stability: computed.stability,
    difficulty: computed.difficulty,
    reps: computed.reps,
    lapses: computed.lapses,
    state: computed.state,
    due: computed.due,
    last_review: new Date().toISOString(),
    elapsed_days: computed.elapsed_days,
    scheduled_days: computed.scheduled_days,
  };
}

const str = (v: unknown): string => v as string;
const optStr = (v: unknown): string | undefined => (v == null ? undefined : (v as string));
const optNumArr = (v: unknown): number[] | undefined =>
  v == null ? undefined : (v as number[]);

/** 命令表：snake_case 命令名 → 处理函数（经插件注册到运行时，卸载自动注销） */
const commands: Record<string, Handler> = {
  // ---- FSRS / review ----
  review_card: reviewCard,
  submit_review: (a) =>
    review.submitReview(
      str(a.token),
      str(a.user_id),
      a.event as Parameters<typeof review.submitReview>[2],
      optNumArr(a.parameters),
      a.desired_retention as number | undefined
    ),
  flush_pending_reviews: (a) =>
    review.flushPendingReviews(
      str(a.token),
      str(a.user_id),
      optNumArr(a.parameters),
      a.desired_retention as number | undefined
    ),
  get_pending_review_count: (a) => review.getPendingReviewCount(str(a.user_id)),
  // renderer dev 直连接口的 outbox 写入（write-ahead 语义保持）
  outbox_enqueue: (a) => { review.enqueueEvent(a.event as never, str(a.user_id)); return null; },
  outbox_dequeue: (a) => { review.dequeueEvent(str(a.review_id)); return null; },

  // ---- auth ----
  auth_request_qr: () => auth.authRequestQr(),
  auth_poll_qr: (a) => auth.authPollQr(str(a.qr_id)),
  auth_email_login: (a) => auth.authEmailLogin(str(a.email), str(a.password)),
  auth_bind_email: (a) => auth.authBindEmail(str(a.token), str(a.email), str(a.password)),
  auth_get_profile: (a) => auth.authGetProfile(str(a.token)),
  auth_save_token: (a) => auth.authSaveToken(str(a.token)),
  auth_load_token: () => auth.authLoadToken(),
  auth_clear_token: () => auth.authClearToken(),
  auth_list_accounts: () => auth.authListAccounts(),
  auth_register_account: (a) =>
    auth.authRegisterAccount(str(a.token), a.profile as Parameters<typeof auth.authRegisterAccount>[1]),
  auth_switch_account: (a) => auth.authSwitchAccount(str(a.key)),
  auth_remove_account: (a) => auth.authRemoveAccount(str(a.key)),

  // ---- api env ----
  get_api_env: () => getApiEnv(),
  set_api_env: setApiEnv,

  // ---- cli ----
  get_cli_install_status: () => cli.getCliInstallStatus(),
  install_cli_tool: () => cli.installCliTool(),

  // ---- cloud：decks ----
  cloud_list_decks: (a) => cloud.cloudListDecks(str(a.token)),
  cloud_create_deck: (a) =>
    cloud.cloudCreateDeck(str(a.token), str(a.name), optStr(a.description), optStr(a.group_id)),
  cloud_update_deck: (a) =>
    cloud.cloudUpdateDeck(
      str(a.token),
      str(a.id),
      str(a.name),
      optStr(a.description),
      optStr(a.group_id),
      a.suspended as boolean | undefined
    ),
  cloud_delete_deck: (a) => cloud.cloudDeleteDeck(str(a.token), str(a.id)),
  cloud_export_deck: exportDeckWithDialog,

  // ---- cloud：cards ----
  cloud_list_cards: (a) =>
    cloud.cloudListCards(str(a.token), {
      deck_id: optStr(a.deck_id),
      keyword: optStr(a.keyword),
      tag: (a.tag as string[] | undefined) ?? undefined,
      page: a.page as number | undefined,
      page_size: a.page_size as number | undefined,
    }),
  cloud_create_card: (a) =>
    cloud.cloudCreateCard(
      str(a.token),
      str(a.deck_id),
      str(a.front),
      str(a.back),
      optStr(a.card_type),
      (a.tags as string[] | undefined) ?? undefined,
      optNumArr(a.cloze_nums)
    ),
  cloud_update_card: (a) =>
    cloud.cloudUpdateCard(
      str(a.token),
      str(a.id),
      optStr(a.deck_id),
      str(a.front),
      str(a.back),
      str(a.card_type),
      (a.tags as string[] | undefined) ?? undefined,
      optNumArr(a.cloze_nums)
    ),
  cloud_delete_card: (a) => cloud.cloudDeleteCard(str(a.token), str(a.id)),

  // ---- cloud：tags ----
  cloud_list_tags: (a) => cloud.cloudListTags(str(a.token), optStr(a.keyword)),
  cloud_rename_tag: (a) => cloud.cloudRenameTag(str(a.token), str(a.id), str(a.name)),
  cloud_delete_tag: (a) => cloud.cloudDeleteTag(str(a.token), str(a.id)),

  // ---- cloud：groups ----
  cloud_list_groups: (a) => cloud.cloudListGroups(str(a.token)),
  cloud_create_group: (a) =>
    cloud.cloudCreateGroup(str(a.token), str(a.name), optStr(a.description), optStr(a.icon), optStr(a.parentId)),
  cloud_update_group: (a) =>
    cloud.cloudUpdateGroup(str(a.token), str(a.id), str(a.name), optStr(a.description), optStr(a.icon), optStr(a.parentId)),
  cloud_delete_group: (a) => cloud.cloudDeleteGroup(str(a.token), str(a.id)),

  // ---- cloud：review / stats / settings ----
  cloud_get_review_queue: (a) => cloud.cloudGetReviewQueue(str(a.token), optStr(a.deck_id)),
  cloud_get_review_settings: (a) => cloud.cloudGetReviewSettings(str(a.token)),
  cloud_update_review_settings: (a) =>
    cloud.cloudUpdateReviewSettings(str(a.token), a.settings as Record<string, unknown>)
};

/** 运行时单例；模块加载即挂载内置命令插件（CLI/test 导入 dispatch 即可用） */
const runtime: RootRuntime = createRuntime();
const initPromise = (async () => {
  await runtime.mount("com.memflow.builtin", (ctx: import("./core/pluginApi").PluginContext) => {
    for (const [name, handler] of Object.entries(commands)) {
      ctx.registerCommand(name, handler);
    }
    // 插件管理命令（builtin 归属）
    ctx.registerCommand("list_plugins", () => listPlugins(runtime));
    ctx.registerCommand("set_plugin_enabled", (a) =>
      setPluginEnabledCommand(runtime, str(a.name), Boolean(a.enabled))
    );
    ctx.registerCommand("get_contributions", () => runtime.contributions());
  });
  await initFeaturePlugins(runtime);
})();

export async function initIpc(): Promise<void> {
  await initPromise;
}

/** camelCase → snake_case（Tauri v2 对 invoke 参数的自动转换，Electron 桥需手动对齐） */
function camelToSnakeKey(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) out[camelToSnakeKey(k)] = v;
  return out;
}

/** 统一入口：归一化参数（Tauri v2 行为对齐）后委托运行时分发 */
export async function dispatch(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  return runtime.dispatch(cmd, normalizeArgs(args));
}
