/**
 * M3.1 外部插件集成测试：
 * 1. 无权限声明的外部插件加载 → 注册命令可用；调用服务被拒（权限门控）
 * 2. 声明 permissions 的外部插件 → service() 可用
 * 3. plugins.json 禁用外部插件 → 不加载
 * 4. 损坏 manifest / 缺入口 → 报告错误不阻塞其他插件
 * 5. 统一启停：list_plugins 含外部插件，set_plugin_enabled 动态卸载/挂载
 */
import fs from "node:fs";
import path from "node:path";
process.env.MEMFLOW_DEV_MODE = "1"; // 未签名外部插件放行（开发模式语义）
import { setEnvOverride, appDataRoot } from "../electron/config";
setEnvOverride("test", "http://localhost:8080");

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : (extra ?? ""));
  cond ? passed++ : failed++;
};

const PLUGINS_DIR = path.join(appDataRoot(), "plugins");

function writePlugin(dirName: string, manifest: Record<string, unknown>, applyCode: string): string {
  const dir = path.join(PLUGINS_DIR, dirName);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "main.cjs"), applyCode);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

async function main() {
  fs.rmSync(PLUGINS_DIR, { recursive: true, force: true });

  // 插件 A：无权限，注册命令 + 尝试访问 db（应在调用时抛权限错）
  writePlugin(
    "hello",
    { name: "com.example.hello", version: "1.0.0", displayName: "Hello", main: "./main.cjs" },
    `exports.apply = (ctx) => {
      ctx.registerCommand("ext_hello", () => ({ from: "hello" }));
      ctx.registerCommand("ext_touch_db", () => {
        try { ctx.service("memflow.db"); return "NO-GATE"; }
        catch (e) { return "GATED:" + e.message.slice(0, 30); }
      });
    };`
  );
  // 插件 B：声明 storage 权限
  writePlugin(
    "withstorage",
    { name: "com.example.withstorage", version: "1.0.0", displayName: "WS", main: "./main.cjs", permissions: ["storage"] },
    `exports.apply = (ctx) => {
      ctx.registerCommand("ext_storage", () => {
        try { ctx.service("memflow.db"); return "OK"; }
        catch (e) { return "FAIL:" + e.message.slice(0, 30); }
      });
    };`
  );
  // 插件 C：损坏 manifest
  fs.mkdirSync(path.join(PLUGINS_DIR, "broken"), { recursive: true });
  fs.writeFileSync(path.join(PLUGINS_DIR, "broken", "manifest.json"), "{ not json");
  // 插件 D：禁用（plugins.json 预置）
  writePlugin(
    "disabled",
    { name: "com.example.disabled", version: "1.0.0", displayName: "Off", main: "./main.cjs" },
    `exports.apply = (ctx) => { ctx.registerCommand("ext_disabled", () => "should not load"); };`
  );
  fs.writeFileSync(
    path.join(appDataRoot(), "plugins.json"),
    JSON.stringify({ version: 1, plugins: { "com.example.disabled": { enabled: false } } })
  );

  // 在 import ipc 之前 fixtures 已写好 → initIpc 的 loadExternalPlugins 会加载它们
  const { dispatch } = await import("../electron/ipc");
  const { loadExternalPlugins, } = await import("../electron/externalPlugins");
  const { createRuntime } = await import("../electron/core/runtime");
  const rt = createRuntime();
  const report = await loadExternalPlugins(rt); // 幂等：已挂载的跳过
  console.log("  加载报告:", JSON.stringify(report));

  check("hello 插件加载", report.loaded.includes("com.example.hello"));
  check("withstorage 插件加载", report.loaded.includes("com.example.withstorage"));
  check("损坏插件进入 errors 不阻塞", report.errors.some((e) => e.name === "broken"));
  check("禁用插件跳过", report.skipped.some((s) => s.name === "com.example.disabled"));

  const hello = (await dispatch("ext_hello", {})) as { from: string };
  check("外部命令 ext_hello 可用", hello.from === "hello");
  const gated = (await dispatch("ext_touch_db", {})) as string;
  check("无权限访问 db 被门控", gated.startsWith("GATED"), gated);
  const storage = (await dispatch("ext_storage", {})) as string;
  check("声明 storage 权限后 service 可用", storage === "OK", storage);

  // 统一列表与启停
  const plugins = (await dispatch("list_plugins", {})) as { name: string; enabled: boolean; mounted: boolean }[];
  const extHello = plugins.find((p) => p.name === "com.example.hello");
  check("list_plugins 含外部插件", !!extHello && extHello.mounted);
  await dispatch("set_plugin_enabled", { name: "com.example.hello", enabled: false });
  let err = "";
  try {
    await dispatch("ext_hello", {});
  } catch (e) {
    err = (e as Error).message;
  }
  check("禁用外部插件后命令注销", err.includes("未知命令"), err);
  await dispatch("set_plugin_enabled", { name: "com.example.hello", enabled: true });
  const hello2 = (await dispatch("ext_hello", {})) as { from: string };
  check("重新启用外部插件后恢复", hello2.from === "hello");

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
