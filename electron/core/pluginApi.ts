/**
 * 插件运行时契约（适配层对外唯一接口）。
 *
 * 业务代码与插件只准 import 本文件 + electron/core/events.ts，
 * 禁止直接 import 'cordis'（唯一直接 import 位于 electron/core/runtime.ts，
 * 升级/替换 Cordis 时只需改那一个文件）。
 */
import type { ContributionPoint, Contributions } from "../../packages/plugin-api/src/index";

/** 某贡献点键对应的条目类型 */
type ContributionItem<K extends ContributionPoint> = NonNullable<Contributions[K]>[number];

export type CmdHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;
export type Disposer = () => void | Promise<void>;

export type ServiceName =
  | "memflow.config"
  | "memflow.db"
  | "memflow.scheduler"
  | "memflow.cloud"
  | "memflow.review"
  | "memflow.auth"
  | "memflow.ui";

/** 插件上下文：注册的一切资源在插件卸载（dispose）时自动清理 */
export interface PluginContext {
  /** 插件名（manifest.name） */
  readonly name: string;
  /** 事件订阅（自动注销） */
  on(event: string, handler: (payload: never) => void): void;
  /** 事件广播（同步） */
  emit(event: string, payload?: unknown): void;
  /** 自定义资源：acquire 函数立即执行，其返回的清理函数在卸载时执行（自动） */
  effect(acquire: () => Disposer | void): void;
  /** 注册 IPC 命令（卸载自动注销；重名抛错） */
  registerCommand(name: string, handler: CmdHandler): void;
  /** 注册贡献点（卸载自动移除） */
  registerContribution<K extends ContributionPoint>(point: K, item: ContributionItem<K>): void;
  /** 消费核心服务（inject 声明的服务在此就绪） */
  service<T = unknown>(name: ServiceName): T;
}

export interface PluginHandle {
  readonly name: string;
  dispose(): Promise<void>;
}

export interface RootRuntime {
  /** 挂载插件；返回就绪的 handle。inject 声明本插件需要的服务（未就绪会等待）。
   * opts.trusted=true（内置/核心插件）全量权限；否则按 manifest.permissions 门控 service()。 */
  mount(
    manifest: import("../../packages/plugin-api/src/index").PluginManifest | string,
    apply: (ctx: PluginContext) => void | Promise<void>,
    inject?: string[],
    opts?: { trusted?: boolean }
  ): Promise<PluginHandle>;
  /** 卸载插件（dispose：命令/贡献点/事件自动清理） */
  unmount(manifestName: string): Promise<void>;
  isMounted(manifestName: string): boolean;
  /** 命令分发（IPC 与 CLI/test 共用入口） */
  dispatch(cmd: string, args: Record<string, unknown>): Promise<unknown>;
  /** 等待全部已挂载插件就绪（启动屏障） */
  whenReady(): Promise<void>;
  /** 当前贡献点聚合表（memflow.ui 服务的数据来源） */
  contributions(): Record<ContributionPoint, unknown[]>;
  /** 贡献点变化事件（emit EVENT_CONTRIBUTIONS_CHANGED） */
  readonly dispose: () => Promise<void>;
}
