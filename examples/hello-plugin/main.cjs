// MemFlow 示例插件：最小可用形态。
// 安装后在插件管理页可见，命令 memflow.cli 可调用 hello_greet。
exports.apply = (ctx) => {
  ctx.registerCommand("hello_greet", () => ({
    greeting: "hello from MemFlow plugin",
    plugin: ctx.name,
  }));
  // 进阶示例（声明 "storage" 权限后取消注释）：
  // const db = ctx.service("memflow.db");
  // ctx.registerCommand("hello_kv_set", (a) => { db.setSyncMeta("hello." + a.key, String(a.value)); return { ok: true }; });
};
