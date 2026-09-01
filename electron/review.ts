/**
 * 复习评分提交编排（移植自 memflow-desktop/src-tauri/src/review.rs）。
 * 统一协议三件套：write-ahead 入队、review_id 幂等、base_version 乐观锁 + 409 重算。
 * FSRS 计算走 @nssai/scheduler（与 Rust fsrs_engine::schedule 经 golden 向量对拍锁定）。
 */
import { createScheduler, type ReviewEvent, type ReviewInput } from "@nssai/scheduler";
import { api, ApiHttpError } from "./http";
import * as db from "./db";

/** 服务端权威卡片状态（POST /api/review 200/409 响应） */
export interface ReviewStateResp {
  card_id: string;
  cloze_num?: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  version: number;
  last_review?: string;
  due?: string;
  duplicate?: boolean;
}

/** 提交失败分类：Transient 留队等网络恢复；Fatal 丢弃（防毒消息堵死 FIFO） */
export class SubmitError extends Error {
  constructor(
    public kind: "transient" | "fatal",
    message: string
  ) {
    super(message);
  }
}

function respToInput(resp: ReviewStateResp): ReviewInput {
  return {
    card_id: resp.card_id,
    cloze_num: resp.cloze_num ?? 0,
    stability: resp.stability,
    difficulty: resp.difficulty,
    reps: resp.reps,
    lapses: resp.lapses,
    state: resp.state,
    version: resp.version,
    last_review: resp.last_review,
  };
}

/** 基于事件与基线快照构建 POST /api/review 请求体（本地 FSRS 计算，保留原始复习时刻） */
function buildSubmitBody(
  event: ReviewEvent,
  base: ReviewInput,
  parameters?: number[],
  desiredRetention?: number
): Record<string, unknown> {
  const scheduler = createScheduler({
    weights: parameters,
    retention: desiredRetention,
  });
  const computed = scheduler.computeReview(base, event.rating, event.elapsed_ms, {
    reviewTime: new Date(event.reviewed_at),
    retention: desiredRetention,
  });
  return {
    review_id: event.review_id,
    card_id: event.card_id,
    cloze_num: event.cloze_num ?? 0,
    base_version: base.version,
    stability: computed.stability,
    difficulty: computed.difficulty,
    reps: computed.reps,
    lapses: computed.lapses,
    state: computed.state,
    rating: event.rating,
    elapsed_ms: event.elapsed_ms,
    elapsed_days: computed.elapsed_days,
    scheduled_days: computed.scheduled_days,
    reviewed_at: event.reviewed_at,
    due: computed.due,
  };
}

/**
 * 提交单条事件：200 → 权威状态；409 → 用响应中的权威状态重算重试一次；
 * 网络/5xx → Transient（留队）；其他 4xx → Fatal（丢弃，防毒消息）。
 */
export async function trySubmit(
  token: string,
  event: ReviewEvent,
  parameters?: number[],
  desiredRetention?: number
): Promise<ReviewStateResp> {
  const body = buildSubmitBody(event, event.base, parameters, desiredRetention);
  try {
    return await api.post<ReviewStateResp>("/api/review", body, token);
  } catch (e) {
    if (!(e instanceof ApiHttpError)) {
      // 网络错误（fetch 抛 TypeError 等）
      throw new SubmitError("transient", `网络错误: ${String(e)}`);
    }
    if (e.status === 409) {
      const fresh = e.body as ReviewStateResp;
      const body2 = buildSubmitBody(event, respToInput(fresh), parameters, desiredRetention);
      try {
        return await api.post<ReviewStateResp>("/api/review", body2, token);
      } catch (e2) {
        if (!(e2 instanceof ApiHttpError)) {
          throw new SubmitError("transient", `网络错误: ${String(e2)}`);
        }
        if (e2.status === 409) {
          throw new SubmitError("transient", "反复版本冲突，留待下次重放");
        }
        throw classifyHttpError(e2);
      }
    }
    throw classifyHttpError(e);
  }
}

/** 400/404 等客户端错误视为 Fatal（事件本身有问题，如卡片已删）；5xx 视为 Transient */
function classifyHttpError(e: ApiHttpError): SubmitError {
  const msg =
    (e.body as { error?: string })?.error ??
    `HTTP ${e.status}: ${typeof e.body === "string" ? e.body : JSON.stringify(e.body)}`;
  return new SubmitError(e.status >= 500 ? "transient" : "fatal", msg);
}

/** 评分入口（write-ahead）：先入队，再提交，成功出队。 */
export async function submitReview(
  token: string,
  userId: string,
  event: ReviewEvent,
  parameters?: number[],
  desiredRetention?: number
): Promise<ReviewStateResp> {
  db.enqueueReview(event, userId);
  try {
    const resp = await trySubmit(token, event, parameters, desiredRetention);
    db.dequeueReview(event.review_id);
    return resp;
  } catch (e) {
    if (e instanceof SubmitError && e.kind === "fatal") {
      // 毒消息（如卡片已删除）：丢弃，避免堵死 FIFO
      db.dequeueReview(event.review_id);
      throw new Error(`评分已丢弃: ${e.message}`);
    }
    if (e instanceof SubmitError) {
      throw new Error(`已保存到离线队列（${e.message}）`);
    }
    throw e;
  }
}

/** 重放指定账号积压的离线事件（FIFO，首个 Transient 失败即停止保序）。返回成功出队数量。 */
export async function flushPendingReviews(
  token: string,
  userId: string,
  parameters?: number[],
  desiredRetention?: number
): Promise<number> {
  const events = db.listPendingReviews(userId);
  let flushed = 0;
  for (const event of events) {
    try {
      await trySubmit(token, event, parameters, desiredRetention);
      db.dequeueReview(event.review_id);
      flushed++;
    } catch (e) {
      if (e instanceof SubmitError && e.kind === "fatal") {
        db.dequeueReview(event.review_id); // 毒消息丢弃，继续后续事件
        continue;
      }
      break; // Transient：保序停止
    }
  }
  return flushed;
}

/** 待提交评分数量（UI 角标用；按账号过滤） */
export function getPendingReviewCount(userId: string): number {
  return db.countPendingReviews(userId);
}

// ---- renderer dev 直连模式用的 outbox 原子操作（经由 IPC） ----
export { enqueueReview as enqueueEvent, dequeueReview as dequeueEvent } from "./db";
