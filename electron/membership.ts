/**
 * 会员/配额模块。
 * 移植自 memflow-desktop/src-tauri/src/membership.rs，路径/方法与 Rust 版逐字一致。
 * 本地配额缓存走 db.ts 的 sync_meta KV（quota_cache:{user_id}，含 cached_at）。
 */

import { api, ApiHttpError } from "./http";
import { getSyncMeta, setSyncMeta } from "./db";
import { parseInsufficient } from "./token";

// ---- Types mirroring the cloud billing API responses ----
// 注意：/api/billing/plans 直接序列化 ent 结构体，ent 全字段 omitempty，
// 免费方案 tier=0/monthly_price=0 等零值字段会从 JSON 消失，数值字段必须可选。

export interface MembershipPlan {
  id: string;
  name: string;
  slug: string;
  tier?: number;
  deck_limit?: number;
  card_limit_per_deck?: number;
  sync_enabled?: boolean;
  monthly_price?: number;
  annual_price?: number;
  annual_discount_label?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface SubscriptionInfo {
  tier: string;
  membership_expires_at?: string;
  plan_name?: string;
  status?: string;
  period?: string;
  expires_at?: string;
  auto_renew?: boolean;
  deck_limit: number;
  card_limit_per_deck: number;
}

export interface JsapiPayment {
  app_id: string;
  time_stamp: string;
  nonce_str: string;
  package: string; // JSON 字段为 "package"
  sign_type: string;
  pay_sign: string;
}

export interface PaymentInfo {
  channel: string;
  prepay_id?: string;
  code_url?: string;
  jsapi?: JsapiPayment;
}

export interface SubscribeResult {
  subscription_id: string;
  plan_name?: string;
  period: string;
  amount: number;
  payment?: PaymentInfo;
}

/** GET /api/billing/quota 的响应：会员等级 + 配额上限 + 当前用量。
 *  缓存到 sync_meta.quota_cache:{user_id}，GUI 展示与 CLI 预检共用同一份。 */
export interface UserQuota {
  tier: string;
  deck_count: number;
  deck_limit: number; // 0 = 无限制
  card_limit_per_deck: number; // 0 = 无限制
  sync_enabled?: boolean; // Rust 侧 serde(default = true)，缺省视为 true
}

function quotaCacheKey(userId: string): string {
  return `quota_cache:${userId}`;
}

/** GET /api/billing/plans — list active membership plans (no auth required). */
export async function membershipListPlans(): Promise<MembershipPlan[]> {
  return api.get<MembershipPlan[]>("/api/billing/plans");
}

/** GET /api/billing/my-subscription — current user's subscription + limits. */
export async function membershipGetStatus(token: string): Promise<SubscriptionInfo> {
  return api.get<SubscriptionInfo>("/api/billing/my-subscription", { token });
}

/** 拉取 GET /api/billing/quota 并写入 sync_meta.quota_cache:{user_id}（含 cached_at）。
 *  多账号按 user_id 分 key，切账号互不覆盖。 */
export async function fetchAndCacheQuota(
  token: string,
  userId: string
): Promise<UserQuota> {
  let quota: UserQuota;
  try {
    quota = await api.get<UserQuota>("/api/billing/quota", { token });
  } catch (err) {
    if (err instanceof ApiHttpError) {
      throw new Error(`获取配额失败 (${err.status})`);
    }
    throw err;
  }
  const cached = { ...quota, cached_at: new Date().toISOString() };
  setSyncMeta(quotaCacheKey(userId), JSON.stringify(cached));
  return quota;
}

/** GET /api/billing/quota — 刷新本地配额缓存并返回最新值。 */
export async function membershipRefreshQuota(
  token: string,
  userId: string
): Promise<UserQuota> {
  return fetchAndCacheQuota(token, userId);
}

/** 读取本地配额缓存（sync_meta.quota_cache:{user_id}）；未缓存时返回 null。
 *  GUI 展示与 CLI `quota show` 共用，离线可用。 */
export async function membershipGetQuotaCache(
  userId: string
): Promise<Record<string, unknown> | null> {
  const raw = getSyncMeta(quotaCacheKey(userId));
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`配额缓存损坏: ${String(e)}`);
  }
}

/** POST /api/billing/subscribe — 灵光点扣款订阅（成功即激活）。
 *  Rust 版余额不足时服务端返回 402，转换为 insufficient_tokens|balance|required 错误串。
 *  Electron 版暂未实现原生支付，明确报错引导网页支付。 */
export async function membershipSubscribeNative(
  _token: string,
  _planId: string,
  _period: string
): Promise<SubscribeResult> {
  throw new Error("原生支付暂未在 Electron 版实现，请使用网页支付");
}

// 保持与 Rust 版一致的复用入口：402 解析即 token.parse_insufficient
export { parseInsufficient };
