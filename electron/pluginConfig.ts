/**
 * 插件启停配置（plugins.json，appDataRoot 下）。
 * 未显式配置的插件按 manifest.defaultEnabled（默认 true）；core 插件不参与配置。
 */
import fs from "node:fs";
import path from "node:path";
import { appDataRoot } from "./config";
import type { PluginManifest } from "../packages/plugin-api/src/index";

interface PluginsConfig {
  version: 1;
  plugins: Record<string, { enabled: boolean }>;
}

function configPath(): string {
  return path.join(appDataRoot(), "plugins.json");
}

export function loadPluginConfig(): PluginsConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as PluginsConfig;
    if (raw.version === 1 && typeof raw.plugins === "object") return raw;
  } catch {
    // 缺省/损坏 → 默认配置
  }
  return { version: 1, plugins: {} };
}

export function savePluginConfig(cfg: PluginsConfig): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

/** 插件是否启用（core 恒 true；否则 plugins.json 覆盖 defaultEnabled） */
export function isPluginEnabled(manifest: PluginManifest): boolean {
  if (manifest.core) return true;
  const cfg = loadPluginConfig();
  const entry = cfg.plugins[manifest.name];
  return entry?.enabled ?? manifest.defaultEnabled ?? true;
}

export function setPluginEnabled(name: string, enabled: boolean): void {
  const cfg = loadPluginConfig();
  cfg.plugins[name] = { enabled };
  savePluginConfig(cfg);
}
