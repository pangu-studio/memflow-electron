/**
 * 外部插件加载器（M3.1）：扫描 appDataRoot/plugins/ 目录，验签后经运行时挂载。
 *
 * 插件包形态（目录）：
 *   plugins/<任意目录名>/
 *     ├── manifest.json   # 含 name/version/displayName/main/permissions/[signature]
 *     └── main.cjs        # module.exports = { apply(ctx) } 或 (ctx) => {}
 *
 * 信任策略见 signature.ts：可信公钥（trusted_plugin_keys.json）验签；
 * 未签名插件开发模式放行+警告，发布版拒绝。
 * 启停与内置插件统一走 plugins.json + list_plugins/set_plugin_enabled。
 */
import fs from "node:fs";
import path from "node:path";
import { appDataRoot, isPackaged } from "./config";
import { checkPluginSignature } from "./signature";
import { isPluginEnabled } from "./pluginConfig";
import { validateManifest, type PluginManifest, type PluginPermission } from "../packages/plugin-api/src/index";
import type { PluginContext, RootRuntime } from "./core/pluginApi";

export interface ExternalPlugin {
  manifest: PluginManifest;
  apply: (ctx: PluginContext) => void;
  dir: string;
}

export interface LoadReport {
  loaded: string[];
  skipped: { name: string; reason: string }[];
  errors: { name: string; error: string }[];
}

function pluginsDir(): string {
  return path.join(appDataRoot(), "plugins");
}

/** 扫描插件目录（不加载代码） */
export function scanExternalPlugins(dir = pluginsDir()): ExternalPlugin[] {
  const out: ExternalPlugin[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // 目录不存在 = 无外部插件
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const pluginDir = path.join(dir, e.name);
    try {
      out.push(loadExternalPlugin(pluginDir));
    } catch {
      // 单个插件损坏不阻塞其余（详细原因在 loadExternalPlugins 报告里重取）
    }
  }
  return out;
}

function loadExternalPlugin(pluginDir: string): ExternalPlugin {
  const rawManifest = JSON.parse(fs.readFileSync(path.join(pluginDir, "manifest.json"), "utf-8")) as Record<string, unknown>;
  const manifest = validateManifest(rawManifest);
  if (!manifest.main) throw new Error(`${manifest.name}: 外部插件需声明 main 入口`);
  const entryFile = path.resolve(pluginDir, manifest.main);
  // 验签（含入口文件完整性）
  const sig = checkPluginSignature(pluginDir, rawManifest, entryFile, { isPackaged: isPackaged() });
  if (!sig.ok) throw new Error(`${manifest.name}: ${sig.reason}`);
  if (sig.devAllowUnsigned) {
    console.warn(`[plugins] 开发模式放行未签名插件 ${manifest.name}（${pluginDir}）`);
  }
  // 加载入口模块（CJS）
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(entryFile) as { apply?: (ctx: PluginContext) => void } | ((ctx: PluginContext) => void);
  const apply: unknown = typeof mod === "function" ? mod : (mod as { apply?: unknown }).apply;
  if (typeof apply !== "function") throw new Error(`${manifest.name}: main 入口需导出 apply(ctx)`);
  return { manifest, apply: apply as (ctx: PluginContext) => void, dir: pluginDir };
}

/** 加载并挂载全部外部插件（按 plugins.json 启停过滤），返回报告 */
export async function loadExternalPlugins(rt: RootRuntime, dir = pluginsDir()): Promise<LoadReport> {
  const report: LoadReport = { loaded: [], skipped: [], errors: [] };
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return report;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const pluginDir = path.join(dir, e.name);
    try {
      const plugin = loadExternalPlugin(pluginDir);
      if (rt.isMounted(plugin.manifest.name)) {
        report.skipped.push({ name: plugin.manifest.name, reason: "已挂载（重复加载跳过）" });
        continue;
      }
      if (!isPluginEnabled(plugin.manifest)) {
        report.skipped.push({ name: plugin.manifest.name, reason: "已在 plugins.json 中禁用" });
        continue;
      }
      await rt.mount(plugin.manifest, plugin.apply, injectForPermissions(plugin.manifest));
      report.loaded.push(plugin.manifest.name);
    } catch (err) {
      report.errors.push({ name: e.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (report.errors.length > 0) {
    console.warn(`[plugins] ${report.errors.length} 个外部插件加载失败:`, report.errors);
  }
  return report;
}

/** 权限 → 需要 inject 的服务（cordis 要求显式 inject 才能访问服务） */
const PERMISSION_SERVICES: Record<PluginPermission, string[]> = {
  network: [],
  "cloud.read": ["memflow.cloud"],
  "cloud.write": ["memflow.cloud"],
  storage: ["memflow.db", "memflow.review", "memflow.auth"],
  scheduler: ["memflow.scheduler"],
  ui: ["memflow.ui"],
};

export function injectForPermissions(manifest: PluginManifest): string[] {
  const set = new Set<string>(manifest.inject ?? []);
  for (const p of manifest.permissions ?? []) {
    for (const s of PERMISSION_SERVICES[p] ?? []) set.add(s);
  }
  return [...set];
}

/** 供 plugins/index 统一列表/启停：扫描目录返回可管理插件 */
export function listExternalPlugins(): { manifest: PluginManifest; apply: (ctx: PluginContext) => void }[] {
  return scanExternalPlugins();
}
