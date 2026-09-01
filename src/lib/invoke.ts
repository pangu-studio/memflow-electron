/**
 * IPC 桥：与 @tauri-apps/api/core 的 invoke() 同签名。
 * Electron 下由 preload 的 contextBridge 暴露 window.memflowInvoke，
 * 经 ipcRenderer.invoke → 主进程命令注册表（命令名与 Tauri 契约一致）。
 *
 * Dev 模式：纯 REST 命令由 renderer 直连（devInvoke），DevTools Network
 * 面板可直接抓包；有状态命令回退 IPC。生产模式恒走 IPC。
 */
declare global {
  interface Window {
    memflowInvoke?<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  }
}

import { devInvoke } from "./devRest";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (import.meta.env.DEV) {
    return devInvoke<T>(cmd, args);
  }
  const bridge = window.memflowInvoke;
  if (!bridge) {
    throw new Error("IPC bridge 未初始化（非 Electron 环境）");
  }
  return bridge<T>(cmd, args ?? {});
}
