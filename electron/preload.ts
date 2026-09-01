/**
 * Preload：以 contextBridge 暴露与 @tauri-apps/api 同签名的最小桥。
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("memflowInvoke", (cmd: string, args?: Record<string, unknown>) =>
  ipcRenderer.invoke("memflow:invoke", { cmd, args })
);

contextBridge.exposeInMainWorld("memflowOnEvent", (handler: (msg: { name: string; payload: unknown }) => void) => {
  ipcRenderer.on("memflow:event", (_e, msg) => handler(msg));
});

contextBridge.exposeInMainWorld("memflowWindow", {
  minimize: () => ipcRenderer.invoke("memflow:window", "minimize"),
  toggleMaximize: () => ipcRenderer.invoke("memflow:window", "toggleMaximize"),
  close: () => ipcRenderer.invoke("memflow:window", "close"),
  setFullscreen: () => ipcRenderer.invoke("memflow:window", "setFullscreen"),
  isFullscreen: () => ipcRenderer.invoke("memflow:window", "isFullscreen"),
});
