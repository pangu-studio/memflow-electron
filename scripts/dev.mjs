#!/usr/bin/env node
/**
 * 开发模式：esbuild watch 构建主进程/preload + Vite dev server + Electron。
 * 用法：npm run dev
 */
import { createServer } from "vite";
import { build, context } from "esbuild";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let electronProc = null;

const ctx = await context({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  outdir: "out",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron", "better-sqlite3"],
  sourcemap: true,
  outExtension: { ".js": ".cjs" },
  absWorkingDir: root,
});

await ctx.rebuild();

function startElectron() {
  if (electronProc) electronProc.kill();
  electronProc = spawn("electron", [".", ...(process.env.MEMFLOW_ELECTRON_ARGS ?? "").split(" ").filter(Boolean)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: "http://localhost:1420" },
  });
  electronProc.on("exit", (code) => {
    if (code !== null && code !== 0) process.exit(code);
  });
}

const vite = await createServer({ root, configFile: path.join(root, "vite.config.ts") });
await vite.listen();
console.log("[dev] vite dev server: http://localhost:1420");

startElectron();
await ctx.watch();

process.on("SIGINT", () => {
  vite.close();
  ctx.dispose();
  if (electronProc) electronProc.kill();
  process.exit(0);
});
