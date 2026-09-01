/**
 * M1.2 集成测试：用真实 TS 模块（非 mock）打本地后端 :8080。
 * 运行：esbuild bundle 后 MEMFLOW_DATA_DIR=/private/tmp/memflow-m12-test node out/test/m12.cjs
 */
import * as auth from "../electron/auth";
import * as cloud from "../electron/cloud";
import * as review from "../electron/review";
import { createScheduler } from "@nssai/scheduler";
import { setEnvOverride } from "../electron/config";

// 纯 Node 下 isPackaged()=true 会指向生产 API，显式覆盖到本地后端
setEnvOverride("test", "http://localhost:8080");

const BASE = "http://localhost:8080";
let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}`, extra ?? "");
  }
}

async function main() {
  // 0. 注册测试账号（直接 REST；已存在则登录会兜底）
  const email = `electron-m12-${Date.now()}@test.com`;
  const password = "test-password-123";
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, nickname: "M12 测试" }),
  });
  console.log(`注册: HTTP ${reg.status}`);

  // 1. 邮箱登录（真实 auth.ts 模块）
  const login = await auth.authEmailLogin(email, password);
  check("authEmailLogin 返回 token", !!login.token);
  const token = login.token;

  // 2. profile + 建档
  const profile = await auth.authGetProfile(token);
  check("authGetProfile id", !!profile.id);
  const summary = await auth.authRegisterAccount(token, profile);
  check("authRegisterAccount 建档", summary.user_id === profile.id);
  check("authLoadToken 共享存储", auth.authLoadToken() === token);

  // 3. 牌组/卡片
  const deck = await cloud.cloudCreateDeck(token, `M12 牌组 ${Date.now()}`);
  check("cloudCreateDeck", !!deck.id);
  const card = await cloud.cloudCreateCard(token, deck.id, " front **Q** ", " back **A** ", "qa", ["m12"], []);
  check("cloudCreateCard", !!card.id);
  const cards = await cloud.cloudListCards(token, { deck_id: deck.id });
  check("cloudListCards 含新卡", (cards as { cards?: { id: string }[] }).cards?.some((c) => c.id === card.id));

  // 4. 复习队列 + FSRS 评分（完整 submit_review 编排）
  // 新卡 due=创建时间，队列按 due<=now 返回，稍等确保可见
  await new Promise((r) => setTimeout(r, 1500));
  const queue = await cloud.cloudGetReviewQueue(token, deck.id);
  const item = (queue as { card_id: string }[]).find((q) => q.card_id === card.id);
  check("cloudGetReviewQueue 含新卡", !!item, `队列 ${queue.length} 项`);

  const q = item as unknown as Record<string, unknown>;
  const event = {
    review_id: crypto.randomUUID(),
    card_id: card.id,
    cloze_num: 0,
    rating: 3,
    elapsed_ms: 4200,
    reviewed_at: new Date().toISOString(),
    base: {
      card_id: card.id,
      cloze_num: 0,
      stability: (q.stability as number) ?? 0,
      difficulty: (q.difficulty as number) ?? 0,
      reps: (q.reps as number) ?? 0,
      lapses: (q.lapses as number) ?? 0,
      state: (q.state as number) ?? 0,
      version: (q.version as number) ?? 1,
      last_review: (q.last_review as string) ?? null,
    },
  };
  const resp = await review.submitReview(token, profile.id, event);
  check("submit_review 返回权威状态 state=2", resp.state === 2, resp);
  check("submit_review reps+1", resp.reps === ((q.reps as number) ?? 0) + 1);
  check("submit_review scheduled_days>=1", resp.due != null && (resp as unknown as { scheduled_days?: number }).scheduled_days !== 0);

  // 5. FSRS 数值：用同一状态手动算一遍对拍（scheduler 在 review.ts 内部也用同包）
  const sched = createScheduler({});
  const manual = sched.computeReview(event.base as never, 3, 4200, { reviewTime: new Date(event.reviewed_at) });
  check("review.ts 与直接 scheduler 计算一致", manual.stability === (resp as unknown as { stability: number }).stability);

  // 6. 统计与设置
  const today = (await cloud.cloudGetTodayStats(token)) as { reviewed?: number };
  check("cloudGetTodayStats reviewed>=1", (today.reviewed ?? 0) >= 1, today);
  const settings = await cloud.cloudGetReviewSettings(token);
  check("cloudGetReviewSettings", !!settings);

  // 7. outbox：flush 空队列返回 0，pending count 归 0
  const flushed = await review.flushPendingReviews(token, profile.id);
  check("flushPendingReviews 空队列=0", flushed === 0);
  check("getPendingReviewCount=0", review.getPendingReviewCount(profile.id) === 0);

  // 8. 多账号存储
  const accountsList = auth.authListAccounts();
  check("authListAccounts 含当前账号", accountsList.some((a) => a.user_id === profile.id));

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
