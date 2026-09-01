/**
 * 适配层单测：RootRuntime 生命周期（挂载/分发/dispose 清理/inject 依赖/贡献点）。
 * 纯 Node，无需 Electron；MEMFLOW_DATA_DIR 隔离。
 */
import { describe, expect, it } from "vitest";
import { createRuntime } from "../electron/core/runtime";
import type { PluginContext } from "../electron/core/pluginApi";

process.env.MEMFLOW_DATA_DIR = "/private/tmp/memflow-runtime-test";

describe("RootRuntime", () => {
  it("挂载插件并注册命令；dispatch 可达", async () => {
    const rt = createRuntime();
    await rt.mount("com.test.basic", (ctx: PluginContext) => {
      ctx.registerCommand("t1_ping", () => ({ pong: true }));
    });
    const r = (await rt.dispatch("t1_ping", {})) as { pong: boolean };
    expect(r.pong).toBe(true);
  });

  it("未知命令报错", async () => {
    const rt = createRuntime();
    await expect(rt.dispatch("no_such_cmd", {})).rejects.toThrow("未知命令");
  });

  it("dispose 后命令自动注销，重名注册被拒绝", async () => {
    const rt = createRuntime();
    const h = await rt.mount("com.test.dispo", (ctx: PluginContext) => {
      ctx.registerCommand("t3_transient", () => "here");
    });
    expect(await rt.dispatch("t3_transient", {})).toBe("here");
    await h.dispose();
    await expect(rt.dispatch("t3_transient", {})).rejects.toThrow("未知命令");
    // 注销后可复用命令名
    await rt.mount("com.test.dispo2", (ctx: PluginContext) => {
      ctx.registerCommand("t3_transient_b", () => "again");
    });
    expect(await rt.dispatch("t3_transient_b", {})).toBe("again");
  });

  it("命令重名在挂载时报错", async () => {
    const rt = createRuntime();
    await rt.mount("com.test.dup1", (ctx: PluginContext) => {
      ctx.registerCommand("t4_dup", () => 1);
    });
    await expect(
      rt.mount("com.test.dup2", (ctx: PluginContext) => {
        ctx.registerCommand("t4_dup", () => 2);
      })
    ).rejects.toThrow(/重名/);
  });

  it("inject 依赖就绪后 apply 才执行；service() 可取核心服务", async () => {
    const rt = createRuntime();
    const order: string[] = [];
    await rt.mount("com.test.inject", (ctx: PluginContext) => {
      const db = ctx.service("memflow.db");
      order.push(typeof (db as { setSyncMeta: unknown }).setSyncMeta === "function" ? "db-ready" : "db-missing");
    }, ["memflow.db"]);
    expect(order).toEqual(["db-ready"]);
  });

  it("贡献点注册/注销驱动聚合表", async () => {
    const rt = createRuntime();
    const h = await rt.mount("com.test.contrib", (ctx: PluginContext) => {
      ctx.registerContribution("navigation", { id: "x", title: "X", route: "/x" });
    });
    const table = rt.contributions();
    expect((table.navigation as { id: string }[]).some((n) => n.id === "x")).toBe(true);
    await h.dispose();
    expect((rt.contributions().navigation as unknown[]).length).toBe(0);
  });

  it("事件订阅随 dispose 自动注销", async () => {
    const rt = createRuntime();
    const got: unknown[] = [];
    const h = await rt.mount("com.test.evt", (ctx: PluginContext) => {
      ctx.on("test/event", (p: never) => got.push(p));
    });
    const emitter = await rt.mount("com.test.evt2", (ctx: PluginContext) => {
      ctx.registerCommand("t7_emit", (args) => {
        ctx.emit("test/event", args);
        return null;
      });
    });
    void emitter;
    await rt.dispatch("t7_emit", { v: 1 });
    await h.dispose();
    await rt.dispatch("t7_emit", { v: 2 });
    expect(got).toEqual([{ v: 1 }]);
  });

  it("effect 清理在 dispose 时执行", async () => {
    const rt = createRuntime();
    const log: string[] = [];
    const h = await rt.mount("com.test.fx", (ctx: PluginContext) => {
      ctx.effect(() => {
        log.push("acquire");
        return () => log.push("release");
      });
    });
    expect(log).toEqual(["acquire"]);
    await h.dispose();
    expect(log).toEqual(["acquire", "release"]);
  });
});
