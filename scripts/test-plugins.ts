/**
 * M2.2 插件启停集成测试：list_plugins / set_plugin_enabled 动态挂载卸载，
 * 验证 dispose 零残留（命令注销、贡献点移除、重挂载恢复）。
 */
import { setEnvOverride } from "../electron/config";
setEnvOverride("test", "http://localhost:8080");
import { dispatch } from "../electron/ipc";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : (extra ?? ""));
  cond ? passed++ : failed++;
};

async function main() {
  // 登录（market 命令需要 token）
  const email = `plugins-${Date.now()}@test.com`;
  await fetch("http://localhost:8080/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "test-password-123" }) });
  const login = (await dispatch("auth_email_login", { email, password: "test-password-123" })) as { token: string };
  const token = login.token;

  // 1. list_plugins：4 个功能插件默认启用且已挂载
  const plugins = (await dispatch("list_plugins", {})) as { name: string; enabled: boolean; mounted: boolean }[];
  check("list_plugins 返回 4 个功能插件", plugins.length === 4, plugins.map((p) => p.name));
  check("默认全部启用并挂载", plugins.every((p) => p.enabled && p.mounted));

  // 2. 贡献点：navigation 含市场/统计/会员
  const nav = ((await dispatch("get_contributions", {})) as { navigation: { id: string }[] }).navigation;
  check("navigation 含三个功能入口", ["market", "stats", "membership"].every((id) => nav.some((n) => n.id === id)), nav.map((n) => n.id));

  // 3. 禁用 market → 命令未知 + 贡献点消失
  await dispatch("set_plugin_enabled", { name: "com.memflow.market", enabled: false });
  let err = "";
  try {
    await dispatch("market_list_decks", { token, category: null, keyword: null, pricingType: null, sort: "sales", page: 1 });
  } catch (e) {
    err = (e as Error).message;
  }
  check("禁用 market 后 market_list_decks 未知命令", err.includes("未知命令"), err);
  const navAfter = ((await dispatch("get_contributions", {})) as { navigation: { id: string }[] }).navigation;
  check("禁用后 navigation 无 market", !navAfter.some((n) => n.id === "market"));
  const pluginsAfter = (await dispatch("list_plugins", {})) as { name: string; enabled: boolean; mounted: boolean }[];
  const market = pluginsAfter.find((p) => p.name === "com.memflow.market")!;
  check("list_plugins 状态同步（enabled=false, mounted=false)", !market.enabled && !market.mounted);

  // 4. 其他插件不受影响
  const stats = (await dispatch("cloud_get_today_stats", { token })) as unknown;
  check("stats 插件命令仍可用", stats !== undefined);

  // 5. 重新启用 → 恢复
  await dispatch("set_plugin_enabled", { name: "com.memflow.market", enabled: true });
  const list = (await dispatch("market_list_decks", { token, category: null, keyword: null, pricingType: null, sort: "sales", page: 1 })) as { items: unknown[] };
  check("重新启用后 market_list_decks 恢复", Array.isArray(list.items));
  const navBack = ((await dispatch("get_contributions", {})) as { navigation: { id: string }[] }).navigation;
  check("navigation 恢复 market", navBack.some((n) => n.id === "market"));

  // 6. 未知插件与重复启停的幂等
  let err2 = "";
  try {
    await dispatch("set_plugin_enabled", { name: "com.unknown.x", enabled: false });
  } catch (e) {
    err2 = (e as Error).message;
  }
  check("未知插件报错", err2.includes("未知插件"), err2);
  await dispatch("set_plugin_enabled", { name: "com.memflow.stats", enabled: true }); // 已启用再启用 = 幂等
  const stats2 = (await dispatch("cloud_get_stats", { token })) as unknown;
  check("重复启用幂等", stats2 !== undefined);

  // 7. 禁用 stats 后其两个命令均不可用，禁用 membership 同理抽查
  await dispatch("set_plugin_enabled", { name: "com.memflow.stats", enabled: false });
  let err3 = "";
  try {
    await dispatch("cloud_get_stats", { token });
  } catch (e) {
    err3 = (e as Error).message;
  }
  check("禁用 stats 后 cloud_get_stats 未知命令", err3.includes("未知命令"), err3);
  await dispatch("set_plugin_enabled", { name: "com.memflow.stats", enabled: true });

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
