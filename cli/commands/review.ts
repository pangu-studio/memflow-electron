/** review 子命令：queue（今日队列）/ do（评分）/ stats（今日统计）/ flush（重放 outbox） */
import * as cloud from "../../electron/cloud";
import * as review from "../../electron/review";
import * as accounts from "../../electron/accounts";
import { listPendingReviews, countPendingReviews } from "../../electron/db";
import { resolveToken, printJson, printError, type GlobalFlags } from "../bin/memflow";

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function run(sub: string | undefined, args: string[], _flags: GlobalFlags): Promise<void> {
  const { token } = resolveToken();
  switch (sub) {
    case "queue":
    case "q": {
      const deck = opt(args, "--deck") ?? opt(args, "-d");
      const queue = await cloud.cloudGetReviewQueue(token, deck);
      printJson(queue);
      break;
    }
    case "do":
    case "rate": {
      const cardId = args.find((a) => !a.startsWith("-"));
      const rating = Number(opt(args, "--rating") ?? opt(args, "-r"));
      if (!cardId || !Number.isInteger(rating) || rating < 1 || rating > 4) {
        printError("用法: memflow review do <card_id> --rating <1-4>");
      }
      const deck = opt(args, "--deck");
      const queue = await cloud.cloudGetReviewQueue(token, deck);
      const item = queue.find((q) => q.card_id === cardId);
      if (!item) printError(`卡片 ${cardId} 不在今日复习队列中`);
      // user_id 取队列项所属（与桌面端一致：事件归属以入队时刻账号为准）
      const event = {
        review_id: crypto.randomUUID(),
        card_id: item.card_id,
        cloze_num: item.cloze_num ?? 0,
        rating,
        elapsed_ms: 0,
        reviewed_at: new Date().toISOString(),
        base: {
          card_id: item.card_id,
          cloze_num: item.cloze_num ?? 0,
          stability: item.stability,
          difficulty: item.difficulty,
          reps: item.reps,
          lapses: item.lapses,
          state: item.state,
          version: item.version,
          last_review: item.last_review ?? null,
        },
      };
      const userId = (item as { user_id?: string }).user_id ?? "";
      const resp = await review.submitReview(token, userId, event);
      printJson(resp);
      break;
    }
    case "stats":
    case "s": {
      const stats = await cloud.cloudGetTodayStats(token);
      printJson(stats);
      break;
    }
    case "flush": {
      // 需 user_id；从 accounts current 取
      const current = accounts.current;
      const acc = current();
      if (!acc) printError("flush 需要已建档账号（accounts.json current 条目）");
      const n = await review.flushPendingReviews(token, acc!.user_id);
      printJson({ ok: true, flushed: n });
      break;
    }
    default:
      printError(`未知 review 子命令: ${sub}（可用: queue/do/stats/flush）`);
  }
}

// 供 status 命令复用
export { listPendingReviews, countPendingReviews };
