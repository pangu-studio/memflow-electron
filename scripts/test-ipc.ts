/**
 * IPC dispatch 层集成测试：走 electron/ipc.ts 的 dispatch() 真实边界
 * （camelCase 归一化 + 参数解包 + 服务模块 + 真实后端）。
 * 这是此前缺失的测试层——test:m12 直调模块绕过了 dispatch。
 */
import { setEnvOverride } from "../electron/config";
setEnvOverride("test", "http://localhost:8080");
// @ts-expect-error 仅测试用途：直接驱动 dispatch（不经 Electron IPC）
import { dispatch } from "../electron/ipc";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : (extra ?? ""));
  cond ? passed++ : failed++;
};

async function main() {
  // 注册+登录（dispatch 边界）
  const email = `ipc-${Date.now()}@test.com`;
  await fetch("http://localhost:8080/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "test-password-123" }) });
  const login = (await dispatch("auth_email_login", { email, password: "test-password-123" })) as { token: string };
  check("dispatch auth_email_login", !!login.token);
  const token = login.token;
  const profile = (await dispatch("auth_get_profile", { token })) as { id: string };
  await dispatch("auth_register_account", { token, profile });
  check("dispatch auth_register_account", true);

  // 牌组/卡片（camelCase 参数经归一化到达后端）
  const deck = (await dispatch("cloud_create_deck", { token, name: `IPC 牌组 ${Date.now() % 10000}`, description: "" })) as { id: string };
  check("dispatch cloud_create_deck", !!deck.id);
  const card = (await dispatch("cloud_create_card", {
    token,
    deckId: deck.id, // camelCase：dispatch 应归一化为 deck_id
    front: "IPC 问题",
    back: "IPC 答案",
    cardType: "qa", // camelCase
    tags: [],
    clozeNums: [], // camelCase
  })) as { id: string };
  check("dispatch cloud_create_card（camelCase deckId/cardType/clozeNums）", !!card.id, card);

  // 队列（camelCase deckId）
  await new Promise((r) => setTimeout(r, 1500));
  const queue = (await dispatch("cloud_get_review_queue", { token, deckId: deck.id })) as { card_id: string }[];
  check("dispatch cloud_get_review_queue（camelCase deckId）", queue.some((q) => q.card_id === card.id), `队列 ${queue.length} 项`);

  // 评分（camelCase userId/desiredRetention）
  const item = queue.find((q) => q.card_id === card.id)! as unknown as Record<string, unknown>;
  const resp = (await dispatch("submit_review", {
    token,
    userId: profile.id, // camelCase
    event: {
      review_id: crypto.randomUUID(),
      card_id: card.id,
      cloze_num: 0,
      rating: 3,
      elapsed_ms: 100,
      reviewed_at: new Date().toISOString(),
      base: {
        card_id: card.id,
        stability: item.stability ?? 0,
        difficulty: item.difficulty ?? 0,
        reps: item.reps ?? 0,
        lapses: item.lapses ?? 0,
        state: item.state ?? 0,
        version: item.version ?? 1,
        last_review: item.last_review ?? null,
      },
    },
    parameters: null,
    desiredRetention: null, // camelCase
  })) as { state: number };
  check("dispatch submit_review（camelCase userId/desiredRetention）", resp.state === 2, resp);

  // 卡片列表（camelCase pageSize）
  const cards = (await dispatch("cloud_list_cards", { token, deckId: deck.id, page: 1, pageSize: 20 })) as { cards: { id: string }[] };
  check("dispatch cloud_list_cards（camelCase deckId/pageSize）", cards.cards?.some((c) => c.id === card.id));

  // 设置与统计
  const settings = await dispatch("cloud_get_review_settings", { token });
  check("dispatch cloud_get_review_settings", !!settings);
  const today = (await dispatch("cloud_get_today_stats", { token })) as { reviewed?: number };
  check("dispatch cloud_get_today_stats", (today.reviewed ?? 0) >= 1);

  // outbox flush（camelCase userId）
  const flushed = (await dispatch("flush_pending_reviews", { token, userId: profile.id, parameters: null, desiredRetention: null })) as number;
  check("dispatch flush_pending_reviews", typeof flushed === "number");

  // 市场列表（camelCase pricingType/sort）
  const market = (await dispatch("market_list_decks", { token, category: null, keyword: null, pricingType: null, sort: "sales", page: 1 })) as { items: unknown[] };
  check("dispatch market_list_decks（camelCase pricingType）", Array.isArray(market.items));

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
