/**
 * devRest 直连分发器回归测试：devInvoke 必须像生产 dispatch()
 * （electron/ipc.ts）一样，把渲染端的 camelCase 参数归一化为
 * snake_case（Tauri v2 约定）后再交给 restHandlers。
 *
 * 回归背景：restHandlers 读 snake_case 键但直接消费渲染端参数，
 * dev 模式下 auth_poll_qr 轮询 /api/auth/wechat/qr/state/undefined、
 * cloud_get_review_queue 的 deckId 静默丢失（拿全局队列）等全链路 undefined。
 */

// Node 环境垫片：devRest 模块加载时读取 localStorage（API base 覆盖）
(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// fetch 桩：捕获 URL；QR 状态轮询直接返回 scanned，
// 避免 electron/auth.ts 的长轮询循环（pending 时最多 300 次 × 1s）拖住测试
const fetchCalls: string[] = [];
(globalThis as any).fetch = async (input: unknown) => {
  const url = typeof input === "string" ? input : (input as { url: string }).url;
  fetchCalls.push(url);
  const body = url.includes("/qr/state/")
    ? { status: "scanned", hint: "" }
    : { status: "pending", hint: "" };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// window.memflowInvoke 桩：捕获 IPC 回退命令的参数
const ipcCalls: { cmd: string; args: Record<string, unknown> }[] = [];
(globalThis as any).window = {
  memflowInvoke: async (cmd: string, args: Record<string, unknown>) => {
    ipcCalls.push({ cmd, args });
    return null;
  },
};

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : JSON.stringify(extra));
  cond ? passed++ : failed++;
};

async function main() {
  // 动态导入：垫片（localStorage/fetch/window）必须早于 devRest 模块初始化
  const { devInvoke } = await import("../src/lib/devRest");
  // 1) auth_poll_qr：camelCase qrId → snake qr_id → URL 不得出现 undefined
  await devInvoke("auth_poll_qr", { qrId: "qr-abc" });
  check(
    "auth_poll_qr 归一化（/qr/state/qr-abc）",
    fetchCalls.some((u) => u.includes("/api/auth/wechat/qr/state/qr-abc")),
    fetchCalls
  );
  check(
    "auth_poll_qr 不含 /state/undefined",
    !fetchCalls.some((u) => u.includes("/state/undefined")),
    fetchCalls
  );

  // 2) cloud_get_review_queue：camelCase deckId → deck_id 查询参数（此前静默拿全局队列）
  fetchCalls.length = 0;
  await devInvoke("cloud_get_review_queue", { token: "tok", deckId: "deck-1" });
  check(
    "cloud_get_review_queue 归一化（deck_id=deck-1）",
    fetchCalls.some((u) => u.includes("deck_id=deck-1")),
    fetchCalls
  );

  // 3) IPC 回退路径同样归一化（对齐 electron/ipc.ts dispatch 行为）
  await devInvoke("get_pending_review_count", { userId: "u-1" });
  const ipcCall = ipcCalls.find((c) => c.cmd === "get_pending_review_count");
  check(
    "IPC 回退归一化（user_id）",
    !!ipcCall && ipcCall.args["user_id"] === "u-1" && !("userId" in ipcCall.args),
    ipcCall
  );

  // 4) 已 snake_case 的参数幂等不受影响
  fetchCalls.length = 0;
  await devInvoke("auth_poll_qr", { qr_id: "qr-xyz" });
  check(
    "snake_case 参数幂等（/qr/state/qr-xyz）",
    fetchCalls.some((u) => u.includes("/api/auth/wechat/qr/state/qr-xyz")),
    fetchCalls
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
