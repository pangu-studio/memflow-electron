/**
 * M1.3 市场链路集成测试：发布 → 审核 → 浏览 → 购买 → 导入。
 * 需要 memflow-cloud 的 admin 凭证（读 .env）与本地后端 :8080。
 */
import fs from "node:fs";
import path from "node:path";
import { setEnvOverride } from "../electron/config";
setEnvOverride("test", "http://localhost:8080");
import * as auth from "../electron/auth";
import * as cloud from "../electron/cloud";
import * as market from "../electron/market";

const BASE = "http://localhost:8080";
let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : (extra ?? ""));
  cond ? passed++ : failed++;
};

async function api(method: string, url: string, token: string | null, body?: unknown) {
  const resp = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${method} ${url} → HTTP ${resp.status}: ${JSON.stringify(data)}`);
  return data;
}

async function newUser(tag: string): Promise<{ token: string; id: string }> {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  await api("POST", "/api/auth/register", null, { email, password: "test-password-123", nickname: tag });
  const { token } = await auth.authEmailLogin(email, "test-password-123");
  const profile = await auth.authGetProfile(token);
  await auth.authRegisterAccount(token, profile);
  return { token, id: profile.id };
}

async function main() {
  // 0. 创作者：建牌组发卡 → 发布
  const creator = await newUser("market-creator");
  // admin 开通创作者账户
  const envFile = fs.readFileSync(path.resolve(__dirname, "../../../memflow-cloud/.env"), "utf-8");
  const adminEmail = envFile.match(/^MEMFLOW_ADMIN_EMAIL=(.+)$/m)?.[1]?.trim();
  const adminPassword = envFile.match(/^MEMFLOW_ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim();
  if (!adminEmail || !adminPassword) {
    console.log("  ⏭️  未找到 admin 凭证，跳过市场链路测试");
    process.exit(2);
  }
  const adminLogin = await auth.authEmailLogin(adminEmail, adminPassword);
  await api("POST", "/api/admin/market/creators", adminLogin.token, { user_id: creator.id });
  check("admin 开通创作者账户", true);
  const deck = await cloud.cloudCreateDeck(creator.token, `市场源牌组 ${Date.now() % 100000}`);
  await cloud.cloudCreateCard(creator.token, deck.id, "市场卡问题", "市场卡答案", "qa", ["market"], []);
  const published = await api("POST", "/api/market/publish", creator.token, {
    deck_id: deck.id,
    title: deck.name,
    description: "UI 自动化测试发布",
    pricing_type: "free",
  });
  check("创作者发布市场牌组", !!published.id, published.id ?? published);
  const marketDeckId = published.id as string;

  // 1. admin 审核上架
  await api("POST", `/api/admin/market/decks/${marketDeckId}/review`, adminLogin.token, {
    action: "approve",
    comment: "自动化测试上架",
  });
  check("admin 审核上架", true);

  // 2. 买家：浏览 → 详情 → 预览 → 购买 → 导入
  const buyer = await newUser("market-buyer");
  const list = await market.marketListDecks(buyer.token, { page: 1, keyword: deck.name });
  const found = (list as { items: { id: string }[] }).items.find((d) => d.id === marketDeckId);
  check("marketListDecks 可见已上架牌组", !!found);
  const detail = await market.marketGetDeck(buyer.token, marketDeckId);
  check("marketGetDeck", !!detail);
  const preview = await market.marketPreview(buyer.token, marketDeckId);
  check("marketPreview 含卡片预览", (preview as { cards?: unknown[] }).cards?.length === 1, JSON.stringify(preview).slice(0, 120));
  const order = await market.marketPurchase(buyer.token, marketDeckId);
  check("marketPurchase（免费牌组）", !!order);
  const imported = await market.marketImport(buyer.token, marketDeckId);
  check("marketImport 返回新牌组", !!(imported as { id?: string }).id);
  const buyerDecks = await cloud.cloudListDecks(buyer.token);
  const hasImported = buyerDecks.some((d) => d.id === (imported as { id: string }).id);
  check("导入牌组进入买家库", hasImported);

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
