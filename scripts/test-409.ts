import { setEnvOverride } from "../electron/config";
setEnvOverride("test", "http://localhost:8080");
import * as auth from "../electron/auth";
import * as cloud from "../electron/cloud";
import * as review from "../electron/review";

async function main() {
  const email = `electron-409-${Date.now()}@test.com`;
  await fetch("http://localhost:8080/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "test-password-123" }) });
  const { token } = await auth.authEmailLogin(email, "test-password-123");
  const profile = await auth.authGetProfile(token);
  await auth.authRegisterAccount(token, profile);
  const deck = await cloud.cloudCreateDeck(token, `409 牌组 ${Date.now()}`);
  const card = await cloud.cloudCreateCard(token, deck.id, "q", "a", "qa", [], []);
  await new Promise((r) => setTimeout(r, 1500));
  const queue = (await cloud.cloudGetReviewQueue(token, deck.id)) as Record<string, unknown>[];
  const item = queue.find((q) => q.card_id === card.id)!;

  const base = { card_id: card.id, cloze_num: 0, stability: item.stability as number, difficulty: item.difficulty as number, reps: item.reps as number, lapses: item.lapses as number, state: item.state as number, version: item.version as number, last_review: (item.last_review as string) ?? null };
  // 第一次评分：version v → v+1
  const e1 = { review_id: crypto.randomUUID(), card_id: card.id, cloze_num: 0, rating: 3, elapsed_ms: 100, reviewed_at: new Date().toISOString(), base };
  const r1 = await review.submitReview(token, profile.id, e1);
  console.log("第一次评分 OK, version:", (r1 as unknown as { version: number }).version);

  // 模拟冲突：新事件携带旧 base.version（服务端已是 v+1）→ 应触发 409 → 自动重算重试成功
  const e2 = { review_id: crypto.randomUUID(), card_id: card.id, cloze_num: 0, rating: 4, elapsed_ms: 100, reviewed_at: new Date().toISOString(), base };
  const r2 = (await review.submitReview(token, profile.id, e2)) as unknown as { state: number; reps: number; version: number };
  const ok = r2.state === 2 && r2.reps === (item.reps as number) + 2;
  console.log(ok ? "✅ 409 冲突自动重算重试成功" : "❌ 409 路径失败", r2);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
