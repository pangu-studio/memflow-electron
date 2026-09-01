/**
 * 自动更新（M1.4）。
 * 复用云端公开端点 GET /api/release/desktop/latest（version + platforms[].installer_url/sha256/size），
 * 与 Tauri updater 同一数据源；下载完成后校验 sha256，再由用户确认安装。
 * 无前端依赖：检查/下载在主进程完成，交互走系统对话框（与 Tauri 插件静默更新行为对齐）。
 */
import { app, dialog, net, BrowserWindow } from "electron";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import { resolveApiBase } from "./config";

export interface LatestRelease {
  version: string;
  platforms: {
    platform: string;
    installer_url: string;
    installer_name?: string;
    installer_size?: number;
    sha256?: string;
  }[];
  release_notes?: string;
  published_at?: string;
}

/** 当前平台对应的 release 模块 platform 键 */
export function platformKey(): string {
  const arch = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : process.arch;
  switch (process.platform) {
    case "darwin":
      return `darwin-${arch}`;
    case "win32":
      return `windows-${arch}`;
    default:
      return `linux-${arch}`;
  }
}

/** 点分版本比较：a<b → -1（对齐 Rust semver.Compare 的宽松版） */
function cmpVersion(a: string, b: string): number {
  const parse = (s: string) =>
    s.replace(/^[vV]/, "").split(".").map((p) => Number(p.match(/\d+/)?.[0] ?? 0));
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export async function fetchLatest(): Promise<LatestRelease | null> {
  const base = resolveApiBase();
  const resp = await net.fetch(`${base}/api/release/desktop/latest`);
  if (!resp.ok) return null;
  return (await resp.json()) as LatestRelease;
}

/** 有可用更新返回 { release, platform }，否则 null */
export async function checkUpdate(): Promise<{
  current: string;
  latest: LatestRelease;
  platform: NonNullable<LatestRelease["platforms"]>[number];
} | null> {
  const latest = await fetchLatest();
  if (!latest?.version || !latest.platforms?.length) return null;
  if (cmpVersion(app.getVersion(), latest.version) >= 0) return null;
  const platform = latest.platforms.find((p) => p.platform === platformKey());
  if (!platform?.installer_url) return null;
  return { current: app.getVersion(), latest, platform };
}

/** 下载安装包到临时目录并校验 sha256；返回文件路径 */
export async function downloadUpdate(
  platform: NonNullable<LatestRelease["platforms"]>[number],
  onProgress?: (downloaded: number, total: number) => void
): Promise<string> {
  const dir = path.join(os.tmpdir(), "memflow-updater");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, platform.installer_name ?? path.basename(new URL(platform.installer_url).pathname));
  const resp = await net.fetch(platform.installer_url);
  if (!resp.ok || !resp.body) throw new Error(`下载更新失败: HTTP ${resp.status}`);
  const total = Number(resp.headers.get("content-length") ?? platform.installer_size ?? 0);
  const reader = resp.body.getReader();
  const chunks: Buffer[] = [];
  let downloaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    downloaded += value.byteLength;
    onProgress?.(downloaded, total);
  }
  const data = Buffer.concat(chunks);
  if (platform.sha256) {
    const sha = crypto.createHash("sha256").update(data).digest("hex");
    if (sha !== platform.sha256.toLowerCase()) {
      throw new Error("更新包校验失败（sha256 不匹配），请稍后再试");
    }
  }
  fs.writeFileSync(dest, data);
  return dest;
}

/** 安装：macOS 打开 dmg 由用户拖入；Windows 静默启动安装程序 */
export async function installUpdate(filePath: string): Promise<void> {
  const { shell } = await import("electron");
  if (process.platform === "win32" && filePath.endsWith(".exe")) {
    const { spawn } = await import("node:child_process");
    spawn(filePath, ["/S"], { detached: true, stdio: "ignore" }).unref();
    app.quit();
    return;
  }
  // macOS：打开 dmg / pkg；Linux AppImage 直接赋予执行权限后启动
  if (filePath.endsWith(".AppImage")) {
    fs.chmodSync(filePath, 0o755);
    const { spawn } = await import("node:child_process");
    spawn(filePath, [], { detached: true, stdio: "ignore" }).unref();
    app.quit();
    return;
  }
  await shell.openPath(filePath);
}

/** 启动后自动检查：有更新 → 下载 → 系统对话框确认安装（对齐 Tauri 插件的静默行为） */
export async function autoUpdateOnLaunch(): Promise<void> {
  try {
    const found = await checkUpdate();
    if (!found) return;
    const win = BrowserWindow.getAllWindows()[0];
    const label = `发现新版本 ${found.latest.version}（当前 ${found.current}）\n\n${found.latest.release_notes ?? ""}\n\n是否现在下载并安装？`;
    const r = await dialog.showMessageBox(win ?? undefined!, {
      type: "info",
      buttons: ["稍后", "下载并安装"],
      defaultId: 1,
      cancelId: 0,
      title: "MemFlow 更新",
      message: label,
    });
    if (r.response !== 1) return;
    const file = await downloadUpdate(found.platform);
    const r2 = await dialog.showMessageBox(win ?? undefined!, {
      type: "info",
      buttons: ["稍后安装", "现在安装"],
      defaultId: 1,
      cancelId: 0,
      title: "更新已就绪",
      message: "更新包已下载并校验通过。现在安装将退出应用。",
    });
    if (r2.response === 1) await installUpdate(file);
  } catch (e) {
    // 更新失败不阻塞启动（离线/服务端不可达等）
    console.error("[updater] 自动更新检查失败:", e);
  }
}
