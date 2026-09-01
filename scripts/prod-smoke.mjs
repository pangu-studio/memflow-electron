// 生产模式冒烟：file:// 加载 dist（npm start 等价路径），CDP 断言渲染。
// 用法：node scripts/prod-smoke.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
const log = (...a) => console.error("[prod-smoke]", ...a); // stderr 不缓冲
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIR = "/private/tmp/memflow-prod-test";
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const email = `prod-smoke-${Date.now()}@test.com`;
const j = (r) => r.json();
await fetch("http://localhost:8080/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "test-password-123" }) }).then(j).catch(() => {});
const { token } = await fetch("http://localhost:8080/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "test-password-123" }) }).then(j);
fs.writeFileSync(`${DIR}/auth_token.json`, JSON.stringify({ token, env: "test" }));
log("token ready");

const electron = spawn("node_modules/.bin/electron", [".", "--no-sandbox", "--remote-debugging-port=9230"], { env: { ...process.env, MEMFLOW_DATA_DIR: DIR }, stdio: "ignore" });
const cleanup = () => { try { electron.kill(); } catch {} };
process.on("exit", cleanup);

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(500);
  try {
    const list = await fetch("http://127.0.0.1:9230/json/list").then(j);
    target = list.find((x) => x.url.includes("index.html"));
  } catch {}
}
if (!target) { log("❌ CDP 页面目标未出现"); cleanup(); process.exit(1); }
log("target:", target.url);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await Promise.race([new Promise((r) => (ws.onopen = r)), sleep(10000).then(() => { throw new Error("ws 连接超时"); })]);
let mid = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++mid; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable");
let ok = false;
for (let i = 0; i < 30; i++) {
  await sleep(500);
  const r = await send("Runtime.evaluate", { expression: "document.body.innerText.length", returnByValue: true });
  if (r?.result?.value > 50) { ok = true; break; }
}
const url = await send("Runtime.evaluate", { expression: "location.href", returnByValue: true });
log(ok ? `✅ 生产模式渲染正常（${url.result.value}）` : "❌ 生产模式渲染失败");
ws.close(); cleanup(); process.exit(ok ? 0 : 1);
