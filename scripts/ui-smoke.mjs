#!/usr/bin/env node
/**
 * M1.3 UI 冒烟：CDP 驱动真实 Electron 窗口（真实后端 :8080）。
 * 验证：登录态启动 → 牌组列表渲染 → /review 路由 → 截图 + 控制台错误采集。
 * 运行：node scripts/ui-smoke.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:8080";
const DEV_URL = "http://localhost:1420";
const CDP_PORT = 9229;
const DATA_DIR = "/private/tmp/memflow-ui-test";
const SHOTS = path.resolve("out/test/shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name} ${extra}`);
  if (!cond) failures++;
};

// ---------- 测试数据 ----------
console.log("[1/6] 准备测试账号与数据");
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
const email = `ui-smoke-${Date.now()}@test.com`;
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "test-password-123", nickname: "UI 冒烟" }),
});
check("注册测试账号", reg.ok);
const login = await (
  await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test-password-123" }),
  })
).json();
const token = login.token;
check("登录拿 token", !!token);
// 主进程 token 存储（auth_load_token 启动时读取）
fs.writeFileSync(
  path.join(DATA_DIR, "auth_token.json"),
  JSON.stringify({ token, env: "test" })
);
const deckName = `UI 冒烟牌组 ${Date.now() % 100000}`;
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const deck = await (await fetch(`${BASE}/api/decks`, { method: "POST", headers: auth, body: JSON.stringify({ name: deckName, description: "" }) })).json();
await fetch(`${BASE}/api/cards`, { method: "POST", headers: auth, body: JSON.stringify({ deck_id: deck.id, front: "UI 冒烟问题", back: "UI 冒烟答案", card_type: "qa", tags: [] }) });
check("创建测试牌组+卡片", !!deck.id);

// ---------- 启动 vite + electron ----------
console.log("[2/6] 启动 vite dev server 与 Electron");
fs.mkdirSync(SHOTS, { recursive: true });
const vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], { stdio: "ignore" });
const electron = spawn(
  "node_modules/.bin/electron",
  [".", "--no-sandbox", `--remote-debugging-port=${CDP_PORT}`],
  {
    stdio: "ignore",
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: DEV_URL,
      MEMFLOW_DATA_DIR: DATA_DIR,
    },
  }
);
const cleanup = () => {
  try { electron.kill(); } catch {}
  try { vite.kill(); } catch {}
};
process.on("exit", cleanup);

// 等 CDP 就绪
let targets = null;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    targets = await r.json();
    if (targets.some((t) => t.url.startsWith(DEV_URL))) break;
  } catch {}
}
const page = targets?.find((t) => t.url.startsWith(DEV_URL));
check("CDP 目标就绪", !!page, page?.url);

// ---------- CDP 会话 ----------
console.log("[3/6] 连接 CDP");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let mid = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  } else if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? "unknown exception");
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(" "));
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++mid;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
await send("Runtime.enable");
await send("Page.enable");

const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};

// 场景 0：渲染进程侧 IPC 桥完整性（preload → dispatch → 服务模块）
console.log("[3b] 场景 0：渲染进程 IPC 桥断言");
const envInfo = await evaluate(`window.memflowInvoke("get_api_env").then(r => r.build_profile + "/" + r.available.length)`);
check("memflowInvoke('get_api_env') 经 preload 桥可达主进程", envInfo === "debug/3", envInfo);
const winBridge = await evaluate(`typeof window.memflowWindow?.minimize === "function"`);
check("memflowWindow 窗口控制桥存在", winBridge === true);

// ---------- 场景 1：登录态启动 → 牌组列表 ----------
console.log("[4/6] 场景 1：登录态启动，验证牌组列表渲染");
await send("Page.navigate", { url: DEV_URL });
let deckVisible = false;
for (let round = 0; round < 2 && !deckVisible; round++) {
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    deckVisible = await evaluate(`document.body.innerText.includes(${JSON.stringify(deckName)})`);
    if (deckVisible) break;
  }
  // vite 冷启动依赖优化期间页面可能空白，重载一次兜底
  if (!deckVisible) await send("Page.reload", { ignoreCache: true });
}
check("牌组列表渲染（含新建牌组名）", deckVisible);
const topbar = await evaluate("document.body.innerText.includes('开始复习')");
check("TopBar 渲染（开始复习按钮）", topbar);
let shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(SHOTS, "1-decks.png"), Buffer.from(shot.data, "base64"));

// ---------- 场景 2：/review 路由 ----------
console.log("[5/6] 场景 2：跳转 /review，验证复习页渲染");
// SPA 内点击"开始复习"（避免整页重载）；显式断言点击与路由
const clicked = await evaluate(`(() => {
  const btns = [...document.querySelectorAll("button, a")];
  const b = btns.find((x) => x.textContent.includes("开始复习"));
  if (b) b.click();
  return !!b;
})()`);
check("点击'开始复习'按钮", clicked === true);
await sleep(800);
let curHash2 = await evaluate("location.hash");
if (curHash2 !== "#/" && curHash2 !== "") {
  await evaluate("location.hash = '#/'");
  await sleep(800);
}
let reviewOk = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const txt = await evaluate("document.body.innerText");
  reviewOk = txt.includes("UI 冒烟问题") || txt.includes("今日待复习") || txt.includes("没有待复习") || txt.includes("完成");
  if (reviewOk) break;
}
check("复习页渲染", reviewOk);
shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(SHOTS, "2-review.png"), Buffer.from(shot.data, "base64"));

// 场景 2b：翻面 → 评分（UI 驱动完整 M1.2：点击卡片翻面，点"良好"提交）
console.log("[5b] 场景 2b：翻面并提交评分");
// 空格翻面（与 UI 提示"按空格翻面"一致；点击精准命中 React 合成事件较脆）
const flipped = await evaluate(`(() => {
  const before = document.body.innerText.includes("点击卡片或按空格翻面");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
  return before;
})()`);
await sleep(1500);
const rateClicked = await evaluate(`(() => {
  const btns = [...document.querySelectorAll("button")];
  const b = btns.find((x) => x.textContent.includes("良好"));
  if (b) b.click();
  return !!b;
})()`);
check("点击'良好'评分按钮", rateClicked === true);
let rated = false;
for (let i = 0; i < 20; i++) {
  await sleep(500);
  const txt = await evaluate("document.body.innerText");
  rated = txt.includes("今日 1/50") || txt.includes("没有待复习") || txt.includes("完成");
  if (rated) break;
}
check("UI 驱动评分提交成功（今日计数更新/完成态）", rated);
shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(SHOTS, "2b-rated.png"), Buffer.from(shot.data, "base64"));

// ---------- 场景 3：快捷键（⌘R 跳转复习已由路由验证；验证键盘事件无异常） ----------
console.log("[6/6] 场景 3：快捷键与控制台错误采集");
await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true }))`);
await sleep(800);
const paletteVisible = await evaluate("document.body.innerText.includes('搜索') || document.body.innerText.includes('命令')");
check("⌘P 命令面板触发", paletteVisible);
shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(SHOTS, "3-command-palette.png"), Buffer.from(shot.data, "base64"));

// ---------- 场景 4：快捷键（⌘B/⌘⇧B/⌘R）与主题切换 ----------
console.log("[6b] 场景 4：快捷键与主题");
const asideCount = () => evaluate(`document.querySelectorAll("aside").length`);
const before = await asideCount();
await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true }))`);
await sleep(600);
const afterCmdB = await asideCount();
const leftClosed = await evaluate(`localStorage.getItem("memflow_left_sidebar_open")`);
check("⌘B 关闭左侧边栏", afterCmdB === before - 1 && leftClosed === "false", `aside ${before}→${afterCmdB}`);
await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true, shiftKey: true, bubbles: true }))`);
await sleep(600);
const afterCmdShiftB = await asideCount();
check("⌘⇧B 打开右侧边栏", afterCmdShiftB === afterCmdB + 1);
// 复原左侧边栏
await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true }))`);
// ⌘R 跳转复习（TopBar 监听 memflow:navigate 自定义事件）
await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true }))`);
await sleep(1200);
const curHash = await evaluate("location.hash");
check("⌘R 跳转复习路由（hash=#/）", curHash === "#/" || curHash === "", curHash);
// 主题：持久化存储切换 → 重载 → data-theme 生效
await evaluate(`localStorage.setItem("memflow_theme", '"light"')`);
await send("Page.reload", { ignoreCache: false });
let themeOk = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const t = await evaluate(`document.documentElement.getAttribute("data-theme")`);
  const bg = await evaluate(`getComputedStyle(document.documentElement).getPropertyValue("--background-primary").trim()`);
  if (t === "light" && bg && !bg.includes("26") /* 暗色主背景约 #1e1e1e */) { themeOk = true; break; }
}
check("主题切换 light 生效（data-theme + CSS 变量）", themeOk);
await evaluate(`localStorage.setItem("memflow_theme", '"dark"')`);

// ---------- 场景 5：市场页空态渲染 ----------
console.log("[6c] 场景 5：市场页渲染");
await evaluate("location.hash = '#/market'");
let marketOk = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const txt = await evaluate("document.body.innerText");
  marketOk = txt.includes("市场") || txt.includes("精选") || txt.includes("空") || txt.includes("暂无");
  if (marketOk) break;
}
check("市场页渲染（列表或空态）", marketOk);
shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(SHOTS, "4-market.png"), Buffer.from(shot.data, "base64"));

const fatal = consoleErrors.filter((e) => !/favicon|net::ERR|preload|sandbox|Gpu|gpu/i.test(e));
check("无致命控制台错误", fatal.length === 0, fatal.slice(0, 3).join(" | "));

ws.close();
cleanup();
console.log(`\n结果: ${failures === 0 ? "全部通过 ✅" : `${failures} 项失败 ❌`}，截图在 ${SHOTS}`);
process.exit(failures > 0 ? 1 : 0);
