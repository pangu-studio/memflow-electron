/**
 * 「安装命令行工具」：把 memflow-cli 接入 PATH。
 * 移植自 memflow-desktop/src-tauri/src/cli_install.rs。
 *
 * 移植决策（与 Rust 版的差异）：
 *   1. Electron 版暂不支持内嵌/双模式二进制分发（Rust 版靠「GUI/CLI 同一
 *      可执行文件 + 软链」实现），因此 installCliTool() 直接抛错，引导用户从
 *      GitHub Releases 手动下载 memflow-cli。
 *   2. getCliInstallStatus() 仍读取 sync_meta.cli_install（与 Rust 版同 key、
 *      同结构，数据可互换），并额外检测记录的软链是否仍存在（fs.existsSync）：
 *      软链丢失时视为未安装（installed=false，另附 linked 字段说明）。
 *   3. Rust 版的状态结构为 { installed, path, target, hint }（无版本字段），
 *      此处保持一致；Windows 的注册表改 PATH 分支在 Electron 版同样不支持。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getSyncMeta, setSyncMeta } from "./db";

/** CLI 安装结果（与 Rust 版 install_cli_tool 返回及 sync_meta.cli_install 存储结构一致） */
export interface CliInstallResult {
  installed: boolean;
  path: string;
  target: string;
  hint: string;
}

/**
 * CLI 安装状态：安装记录 + 软链是否仍存在。
 * installed 已在软链丢失时降级为 false，等价于 Rust 版「未安装返回 None」的语义。
 */
export interface CliInstallStatus extends CliInstallResult {
  /** 记录的软链当前是否仍存在（fs.existsSync）；false 表示安装已失效 */
  linked: boolean;
}

/** sync_meta 中存储安装记录的 key（与 Rust 版一致） */
export const CLI_INSTALL_META_KEY = "cli_install";

/**
 * 安装 memflow-cli 到 PATH（Rust 版语义：幂等，可重复调用修复软链）。
 *
 * Electron 版暂不支持内嵌二进制分发，直接抛错引导手动安装。
 * 与 Rust 版一致：失败时不写 sync_meta。
 */
export function installCliTool(): CliInstallResult {
  throw new Error("Electron 版暂未提供 CLI 内嵌安装，请从 GitHub Releases 手动下载 memflow-cli");
}

/**
 * 读取 CLI 安装状态（sync_meta.cli_install）。
 * Rust 版未安装时返回 None；Electron 版无记录或软链已丢失时返回 null。
 */
export function getCliInstallStatus(): CliInstallStatus | null {
  const raw = getSyncMeta(CLI_INSTALL_META_KEY);
  if (!raw) return null;
  let record: CliInstallResult;
  try {
    record = JSON.parse(raw) as CliInstallResult;
  } catch {
    // 记录损坏时按未安装处理（Rust 版此处返回解析错误，这里更宽松以免 UI 卡死）
    return null;
  }
  const linked = typeof record.path === "string" && fs.existsSync(record.path);
  return { ...record, installed: record.installed && linked, linked };
}

/**
 * 安装结果写入 sync_meta.cli_install（Rust 版 install_cli_tool 的落盘步骤）。
 * Electron 版 installCliTool 恒抛错，此函数保留供未来支持内嵌分发时复用，
 * 或供手动安装成功后由调用方登记状态。
 */
export function saveCliInstallResult(result: CliInstallResult): void {
  setSyncMeta(CLI_INSTALL_META_KEY, JSON.stringify(result));
}

/**
 * Rust 版 install_impl 的候选安装目录（路径解析语义移植，unix）：
 * 优先 /usr/local/bin（通常在 PATH），无权限时回退 ~/.local/bin。
 * Windows 平台在 Rust 版中即不支持自动安装，这里返回空列表。
 */
export function cliLinkCandidates(): string[] {
  if (process.platform === "win32") return [];
  return ["/usr/local/bin", path.join(os.homedir(), ".local", "bin")];
}

/** 候选目录下的 memflow-cli 软链完整路径（path 解析辅助） */
export function cliLinkPaths(): string[] {
  return cliLinkCandidates().map((dir) => path.join(dir, "memflow-cli"));
}

/**
 * 符号链接是否指向给定目标（Rust 版安装幂等性检查的 readlink 语义）。
 * 读不到链接（不存在/非链接/权限不足）一律视为 false。
 */
export function isSymlinkPointingTo(linkPath: string, target: string): boolean {
  try {
    return fs.readlinkSync(linkPath) === target;
  } catch {
    return false;
  }
}
