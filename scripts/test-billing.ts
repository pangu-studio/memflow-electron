/**
 * M1.3 计费域集成测试：market / membership / token 模块打真实本地后端。
 * 免费用户路径：plans(公开) / my-subscription / quota / token balance / packages；
 * 市场列表（dev 库可能无已发布牌组，空列表也合法）。
 */
import { setEnvOverride } from "../electron/config";
setEnvOverride("test", "http://localhost:8080");
import * as auth from "../electron/auth";
import * as market from "../electron/market";
import * as membership from "../electron/membership";
import * as token from "../electron/token";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : (extra ?? ""));
  cond ? passed++ : failed++;
};

async function main() {
  const email = `billing-m13-${Date.now()}@test.com`;
  await fetch("http://localhost:8080/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "test-password-123" }) });
  const { token: jwt } = await auth.authEmailLogin(email, "test-password-123");
  const profile = await auth.authGetProfile(jwt);
  await auth.authRegisterAccount(jwt, profile);
  check("登录+建档", true);

  // membership
  const plans = await membership.membershipListPlans();
  check("membershipListPlans（含免费计划）", plans.some((p: { slug?: string }) => p.slug === "free"), plans.length);
  const status = await membership.membershipGetStatus(jwt);
  check("membershipGetStatus", !!status);
  const quota = await membership.membershipRefreshQuota(jwt, profile.id);
  check("membershipRefreshQuota（free 计划限额）", (quota as { deck_limit?: number }).deck_limit === 3, quota);
  const cached = await membership.membershipGetQuotaCache(profile.id);
  check("membershipGetQuotaCache 缓存命中", cached !== null && (cached as { deck_limit?: number }).deck_limit === 3);

  // token（灵光点）
  const balance = await token.tokenGetBalance(jwt);
  check("tokenGetBalance", typeof (balance as { balance?: number }).balance === "number", balance);
  const pkgs = await token.tokenListPackages(jwt);
  check("tokenListPackages", Array.isArray(pkgs));
  const txs = await token.tokenListTransactions(jwt, 1);
  check("tokenListTransactions", Array.isArray((txs as { items?: unknown[] }).items));
  let nativeErr = "";
  try { await token.tokenRechargeNative(jwt, "pkg-x"); } catch (e) { nativeErr = (e as Error).message; }
  check("tokenRechargeNative 明确报错（Electron 未接原生支付）", nativeErr.includes("网页支付"), nativeErr);

  // market（dev 库可能为空）
  const list = await market.marketListDecks(jwt, { page: 1 });
  check("marketListDecks", Array.isArray((list as { items?: unknown[] }).items), `共 ${(list as { total?: number }).total ?? "?"} 项`);
  let subErr = "";
  try { await membership.membershipSubscribeNative(jwt, "plan-x", "monthly"); } catch (e) { subErr = (e as Error).message; }
  check("membershipSubscribeNative 明确报错", subErr.includes("网页支付"), subErr);

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
