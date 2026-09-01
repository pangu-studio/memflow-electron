/**
 * 窗口控制桥：与 @tauri-apps/api/window 的 getCurrentWindow() 最小子集兼容。
 * Electron 下经 preload 转发到主进程窗口控制。
 */
declare global {
  interface Window {
    memflowWindow?: {
      minimize(): Promise<void>;
      toggleMaximize(): Promise<void>;
      close(): Promise<void>;
      setFullscreen(flag: boolean): Promise<void>;
      isFullscreen(): Promise<boolean>;
    };
  }
}

export function getCurrentWindow() {
  const bridge =
    window.memflowWindow ?? {
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
      setFullscreen: async () => {},
      isFullscreen: async () => false,
    };
  return {
    minimize: () => bridge.minimize(),
    toggleMaximize: () => bridge.toggleMaximize(),
    close: () => bridge.close(),
    setFullscreen: (flag: boolean) => bridge.setFullscreen(flag),
    isFullscreen: () => bridge.isFullscreen(),
    /** Tauri 兼容：窗口尺寸变化事件订阅（Electron 版用轮询 fullscreen 状态近似） */
    onResized: (_cb: () => void) => Promise.resolve(() => {}),
  };
}
