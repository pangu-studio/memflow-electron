/**
 * 应用配置（移植自 memflow-desktop/src-tauri/src/config.rs）。
 * release 与 dev 数据目录隔离；api_env 覆盖存 api_config.json（GUI 与 CLI 共享）。
 * 零 electron 依赖：CLI 与 GUI 共用本模块（路径经 MEMFLOW_DATA_DIR 可覆盖）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 是否为打包产物（等价 electron app.isPackaged；CLI 下恒为 true 语义）。
 * MEMFLOW_DEV_MODE=1 强制开发模式（测试/CLI 调试外部插件时放行未签名包）。 */
export function isPackaged(): boolean {
  if (process.env.MEMFLOW_DEV_MODE === "1") return false;
  return !(process as unknown as { defaultApp?: string | boolean }).defaultApp;
}

/** 平台默认应用数据根（对齐 Electron app.getPath('appData') 的取值） */
function platformAppData(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  if (process.platform === "win32") {
    return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
}

/** 应用数据根目录：dev 使用独立 -dev 目录，不与生产版共享配置/token/数据库 */
export function appDataRoot(): string {
  // 便携式/测试覆盖：MEMFLOW_DATA_DIR 环境变量优先（CLI 与测试用）
  if (process.env.MEMFLOW_DATA_DIR) return process.env.MEMFLOW_DATA_DIR;
  const dirName = isPackaged() ? "com.pangustudio.desktop" : "com.pangustudio.desktop-dev";
  return path.join(platformAppData(), dirName);
}

export const PROD_API_BASE = "https://apis.memflow.com.cn";
export const DEV_API_BASE = "http://localhost:8080";

export function compileTimeDefault(): string {
  return isPackaged() ? PROD_API_BASE : DEV_API_BASE;
}

export interface Environment {
  key: string;
  label: string;
  base: string;
}

export function builtinEnvironments(): Environment[] {
  return [
    { key: "prod", label: "生产", base: PROD_API_BASE },
    { key: "staging", label: "预发", base: "https://tapis.memflow.com.cn" },
    { key: "test", label: "测试", base: "http://localhost:8080" },
  ];
}

export function validateCustomUrl(url: string): void {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("URL 必须以 http:// 或 https:// 开头");
  }
  if (url.length < 10) throw new Error("URL 格式无效");
}

interface ApiEnvOverride {
  env?: string;
  custom_url?: string;
}

function configPath(): string {
  return path.join(appDataRoot(), "api_config.json");
}

export function saveOverride(envKey: string, customUrl?: string): void {
  const ov: ApiEnvOverride = { env: envKey };
  if (envKey === "custom") {
    if (!customUrl) throw new Error("自定义环境需要提供 URL");
    validateCustomUrl(customUrl);
    ov.custom_url = customUrl;
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(ov, null, 2));
}

export function loadOverride(): { env?: string; customUrl?: string } {
  try {
    const ov = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as ApiEnvOverride;
    return { env: ov.env, customUrl: ov.custom_url };
  } catch {
    return {};
  }
}

// ---- CLI --app-env 进程级覆盖（仅本次进程生效，不落盘） ----
let cliEnvOverride: { key: string; base: string } | null = null;

/** 解析 --app-env 取值：内置环境 key 或 http(s) URL（URL 形式 key 记为 custom） */
export function resolveEnvFlag(flag: string): { key: string; base: string } {
  for (const env of builtinEnvironments()) {
    if (env.key === flag) return { key: env.key, base: env.base };
  }
  if (flag.startsWith("http://") || flag.startsWith("https://")) {
    validateCustomUrl(flag);
    return { key: "custom", base: flag.trimEnd() };
  }
  const keys = builtinEnvironments().map((e) => e.key).join("/");
  throw new Error(`未知环境：${flag}（可选 ${keys}，或直接给 http(s) URL）`);
}

/** 设置进程级环境覆盖（CLI 启动时调用一次；后续调用静默忽略） */
export function setEnvOverride(key: string, base: string): void {
  if (!cliEnvOverride) cliEnvOverride = { key, base };
}

/** 当前生效的 API base：CLI 覆盖 > 持久化 custom URL > 内置环境 > 编译期默认 */
export function resolveApiBase(): string {
  if (cliEnvOverride) return cliEnvOverride.base;
  const { env: envKey, customUrl } = loadOverride();
  if (envKey) {
    if (envKey === "custom" && customUrl?.startsWith("http")) return customUrl;
    for (const env of builtinEnvironments()) {
      if (env.key === envKey) return env.base;
    }
  }
  return compileTimeDefault();
}

/** 当前生效的环境 key（供 token 环境错配提示） */
export function currentEnvKey(): string | undefined {
  return cliEnvOverride?.key ?? loadOverride().env;
}
