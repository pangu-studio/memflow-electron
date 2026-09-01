/**
 * Electron 主进程入口。
 */
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { initDb } from "./db";
import { dispatch, initIpc } from "./ipc";
import { autoUpdateOnLaunch } from "./update";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#1e1e1e",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要 require('electron') 之外的 node 模块（无，但保稳妥）
    },
  });

  // 外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

async function registerIpc(): Promise<void> {
  await initIpc();
  ipcMain.handle("memflow:invoke", async (_event, payload: { cmd: string; args: Record<string, unknown> }) => {
    return dispatch(payload.cmd, payload.args ?? {});
  });
  // 窗口控制（TopBar 自定义按钮）
  ipcMain.handle("memflow:window", (_e, action: string) => {
    const win = mainWindow;
    if (!win) return;
    if (action === "minimize") win.minimize();
    else if (action === "toggleMaximize") {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else if (action === "close") win.close();
    else if (action === "setFullscreen") win.setFullScreen(true);
    else if (action === "unsetFullscreen") win.setFullScreen(false);
    else if (action === "isFullscreen") return win.isFullScreen();
  });
}

app.whenReady().then(() => {
  initDb();
  void registerIpc();
  createWindow();
  // 打包版启动后自动检查更新（复用云端 /api/release/desktop/latest）
  if (app.isPackaged) void autoUpdateOnLaunch();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
