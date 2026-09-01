/**
 * IPC 桥：与 @tauri-apps/api/core 的 invoke() 同签名。
 * Electron 下由 preload 的 contextBridge 暴露 window.memflowInvoke，
 * 经 ipcRenderer.invoke → 主进程命令注册表（命令名与 Tauri 契约一致）。
 */
declare global {
  interface Window {
    memflowInvoke?<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  }
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = window.memflowInvoke;
  if (!bridge) {
    throw new Error("IPC bridge 未初始化（非 Electron 环境）");
  }
  return bridge<T>(cmd, args ?? {});
}
