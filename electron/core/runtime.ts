/**
 * Cordis 运行时实现 —— 全仓唯一直接 import 'cordis' 的文件。
 *
 * 职责：
 * - RootContext 管理与插件挂载（fiber 生命周期、inject 依赖驱动）
 * - CommandRegistry / ContributionRegistry（插件注册，dispose 自动清理）
 * - 7 个核心服务的 Service 壳（薄包装：实现体在各服务模块，此处仅接线）
 *
 * 适配层契约见 electron/core/pluginApi.ts。Cordis 升级/API 变更只需改本文件。
 */
import { Context, Service } from "cordis";
import type {
  CmdHandler,
  Disposer,
  PluginContext,
  PluginHandle,
  RootRuntime,
  ServiceName,
} from "./pluginApi";
export type { RootRuntime } from "./pluginApi";
import { EVENT_CONTRIBUTIONS_CHANGED } from "./events";
import {
  CONTRIBUTION_POINTS,
  validateManifest,
  type ContributionPoint,
  type Contributions,
  type PluginManifest,
} from "../../packages/plugin-api/src/index";

// 服务实现体（纯模块，不依赖 cordis）
import * as config from "../config";
import * as db from "../db";
import { createScheduler } from "@nssai/scheduler";
import * as cloud from "../cloud";
import * as review from "../review";
import * as auth from "../auth";

// ============================================================================
// Service 壳（薄包装：Object.assign 注入实现体；依赖经 ctx 代理延迟解析）
// ============================================================================

type ImplFactory = (ctx: Context) => Record<string, unknown>;

function defineService(name: ServiceName, injectNames: string[], impl: ImplFactory) {
  class Svc extends Service {
    static inject = injectNames;
    constructor(ctx: Context) {
      super(ctx, name);
      Object.assign(this, impl(ctx));
    }
  }
  return Svc;
}

/** 服务实现体内消费兄弟服务：deps('memflow.db') 返回 ctx 代理访问 */
function deps(ctx: Context) {
  return new Proxy(
    {},
    {
      get: (_t, key: string) => ctx[key as never],
    }
  ) as Record<string, unknown>;
}

let runtimeRef: RuntimeImpl | null = null;

const coreServices: { name: ServiceName; inject: string[]; impl: ImplFactory }[] = [
  {
    name: "memflow.config",
    inject: [],
    impl: () => ({ ...config }),
  },
  {
    name: "memflow.db",
    inject: [],
    impl: () => ({ ...db }),
  },
  {
    name: "memflow.scheduler",
    inject: [],
    impl: () => ({ create: createScheduler }),
  },
  {
    name: "memflow.cloud",
    inject: ["memflow.config"],
    impl: () => ({ ...cloud }),
  },
  {
    name: "memflow.review",
    inject: ["memflow.cloud", "memflow.db", "memflow.scheduler"],
    impl: (ctx) => {
      const d = deps(ctx);
      return {
        submitReview: (token: string, userId: string, event: never, parameters?: number[], retention?: number) =>
          review.submitReview(token, userId, event, parameters, retention),
        trySubmit: review.trySubmit,
        flushPendingReviews: (token: string, userId: string, parameters?: number[], retention?: number) =>
          review.flushPendingReviews(token, userId, parameters, retention),
        getPendingReviewCount: (userId: string) => {
          void d; // db 由 review 模块内部使用；服务面保持一致
          return review.getPendingReviewCount(userId);
        },
        enqueueEvent: review.enqueueEvent,
        dequeueEvent: review.dequeueEvent,
      };
    },
  },
  {
    name: "memflow.ui",
    inject: [],
    impl: (ctx) => ({
      /** 当前贡献点聚合表（导航/设置页/命令等的下发数据源） */
      table: () => runtimeRef?.contributions() ?? ({ commands: [], commandPalette: [], navigation: [], settingsPages: [], cardRenderers: [], reviewActions: [], deckSources: [] }),
      /** 贡献点变更订阅（注销随插件生命周期自动清理） */
      onChanged: (handler: (payload: unknown) => void) => ctx.on(EVENT_CONTRIBUTIONS_CHANGED as never, handler as never),
    }),
  },
  {
    name: "memflow.auth",
    inject: ["memflow.config"],
    impl: () => ({
      ...auth,
      saveToken: auth.authSaveToken,
      loadToken: auth.authLoadToken,
      clearToken: auth.authClearToken,
      listAccounts: auth.authListAccounts,
      registerAccount: auth.authRegisterAccount,
      switchAccount: auth.authSwitchAccount,
      removeAccount: auth.authRemoveAccount,
    }),
  },
];

// ============================================================================
// RootRuntime
// ============================================================================

class PluginContextImpl implements PluginContext {
  constructor(
    private readonly rt: RuntimeImpl,
    readonly name: string,
    private readonly ctx: Context
  ) {}

  on(event: string, handler: (payload: never) => void): void {
    this.ctx.on(event as never, handler as never);
  }

  emit(event: string, payload?: unknown): void {
    this.ctx.emit(event as never, payload as never);
  }

  effect(acquire: () => Disposer | void): void {
    // cordis 语义：acquire 立即执行，返回的 disposer 在卸载时调用
    this.ctx.effect(acquire as never);
  }

  registerCommand(name: string, handler: CmdHandler): void {
    const remove = this.rt.registerCommand(this.name, name, handler);
    this.effect(() => remove);
  }

  registerContribution<K extends ContributionPoint>(point: K, item: NonNullable<Contributions[K]>[number]): void {
    const remove = this.rt.addContribution(this.name, point, item as unknown as Record<string, unknown>);
    this.effect(() => remove);
  }

  service<T = unknown>(name: ServiceName): T {
    return (this.ctx as unknown as Record<string, unknown>)[name] as unknown as T;
  }
}

class RuntimeImpl implements RootRuntime {
  private readonly ctx = new Context();
  private readonly commands = new Map<string, { owner: string; handler: CmdHandler }>();
  private readonly contrib = new Map<ContributionPoint, Map<string, unknown[]>>();
  private readonly fibers: Promise<unknown>[] = [];
  private readonly handles = new Map<string, PluginHandle>();
  private readonly pending: Promise<unknown>[] = [];

  constructor() {
    for (const p of CONTRIBUTION_POINTS) this.contrib.set(p, new Map());
  }

  /** 注册核心服务（服务名 → Service 壳）；插件化后 inject 可用 */
  registerCoreServices(): void {
    for (const s of coreServices) {
      this.ctx.plugin(defineService(s.name, s.inject, s.impl));
    }
  }

  mount(
    manifestOrName: PluginManifest | string,
    apply: (ctx: PluginContext) => void | Promise<void>,
    inject?: string[]
  ): Promise<PluginHandle> {
    const manifest: PluginManifest =
      typeof manifestOrName === "string"
        ? { name: manifestOrName, version: "0.0.0", displayName: manifestOrName }
        : validateManifest(manifestOrName);
    const manifestName = manifest.name;
    const plugin = {
      inject,
      apply: (ctx: Context) => {
        const pctx = new PluginContextImpl(this, manifestName, ctx);
        return apply(pctx) as never;
      },
    };
    // cordis 4 rc 的 plugin() 对无 config 插件要求显式第二参（类型层面）
    const fiber = (this.ctx.plugin as (p: unknown, config?: unknown) => PromiseLike<unknown> & { dispose?: () => Promise<void> })(
      plugin,
      undefined
    );
    const ready = Promise.resolve(fiber as PromiseLike<unknown>).catch((e) => {
      throw new Error(`插件 ${manifestName} 加载失败: ${e instanceof Error ? e.message : String(e)}`);
    });
    this.fibers.push(ready);
    this.pending.push(ready);
    const handle: PluginHandle = {
      name: manifestName,
      dispose: async () => {
        await (fiber as { dispose?: () => Promise<void> }).dispose?.();
        this.handles.delete(manifestName);
      },
    };
    this.handles.set(manifestName, handle);
    return ready.then(() => handle);
  }

  async unmount(manifestName: string): Promise<void> {
    const h = this.handles.get(manifestName);
    if (!h) throw new Error(`插件未加载: ${manifestName}`);
    await h.dispose();
  }

  isMounted(manifestName: string): boolean {
    return this.handles.has(manifestName);
  }

  registerCommand(owner: string, name: string, handler: CmdHandler): Disposer {
    if (this.commands.has(name)) {
      throw new Error(`命令重名: ${name}（${owner} 与已注册插件冲突）`);
    }
    this.commands.set(name, { owner, handler });
    this.bumpContributions();
    return () => {
      if (this.commands.get(name)?.owner === owner) this.commands.delete(name);
      this.bumpContributions();
    };
  }

  addContribution(owner: string, point: ContributionPoint, item: Record<string, unknown>): Disposer {
    const map = this.contrib.get(point)!;
    const list = map.get(owner) ?? [];
    list.push(item);
    map.set(owner, list);
    this.bumpContributions();
    return () => {
      const cur = map.get(owner);
      if (cur) {
        const idx = cur.indexOf(item);
        if (idx >= 0) cur.splice(idx, 1);
        if (cur.length === 0) map.delete(owner);
      }
      this.bumpContributions();
    };
  }

  private contributionsVersion = 0;
  private bumpContributions(): void {
    this.contributionsVersion++;
    this.ctx.emit(EVENT_CONTRIBUTIONS_CHANGED as never, { version: this.contributionsVersion } as never);
  }

  contributions(): Record<ContributionPoint, unknown[]> {
    const out = {} as Record<ContributionPoint, unknown[]>;
    for (const p of CONTRIBUTION_POINTS) {
      out[p] = [...(this.contrib.get(p)?.values() ?? [])].flat();
    }
    return out;
  }

  async dispatch(cmd: string, args: Record<string, unknown>): Promise<unknown> {
    await this.whenReady();
    const entry = this.commands.get(cmd);
    if (!entry) throw new Error(`未知命令: ${cmd}`);
    return entry.handler(args);
  }

  async whenReady(): Promise<void> {
    // 失败的挂载已由其调用方（mount 返回的 promise）感知；
    // 此处用 allSettled 避免历史失败污染后续 dispatch。
    await Promise.allSettled(this.pending);
  }

  readonly dispose = async (): Promise<void> => {
    await (this.ctx as unknown as { dispose?: () => Promise<void> }).dispose?.();
  };
}

let runtime: RuntimeImpl | null = null;

/** 创建并初始化运行时：注册核心服务 + 核心服务插件（恒加载） */
export function createRuntime(): RootRuntime {
  if (runtime) return runtime;
  runtime = new RuntimeImpl();
  runtimeRef = runtime;
  runtime.registerCoreServices();
  return runtime;
}