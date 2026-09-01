/**
 * 灵光点（代币）模块。
 * 移植自 memflow-desktop/src-tauri/src/token.rs，路径/方法与 Rust 版逐字一致。
 * 402 余额不足解析（parse_insufficient）供 market / membership 复用。
 */

import { api, ApiHttpError } from "./http";

// ---- Types mirroring the cloud billing API responses ----
// 注意：ent 生成的结构体所有字段都带 omitempty，任何零值字段（0/""）都会从 JSON 中消失，
// 因此这里所有数值字段都必须可选/带默认值语义，否则零余额/零售价时解码失败。

export interface TokenBalance {
  balance: number;
  total_recharged: number;
  total_consumed: number;
}

export interface TokenPackage {
  id: string;
  name: string;
  token_amount: number;
  bonus_amount: number;
  price: number; // 分
  channel_limit: string;
  midas_product_id: string;
  sort_order: number;
}

interface TokenPackageList {
  items: TokenPackage[];
}

export interface JsapiPayment {
  app_id: string;
  time_stamp: string;
  nonce_str: string;
  package: string;
  sign_type: string;
  pay_sign: string;
}

export interface PaymentInfo {
  channel: string;
  prepay_id?: string;
  code_url?: string;
  jsapi?: JsapiPayment;
}

export interface RechargeResult {
  transaction_id: string;
  amount: number;
  bonus: number;
  price: number;
  payment?: PaymentInfo;
}

export interface TokenTransaction {
  id: string;
  type: string; // JSON 字段为 "type"
  amount: number;
  balance_after?: number;
  status: string;
  remark?: string;
  created_at: string;
}

export interface TokenTransactionList {
  items: TokenTransaction[];
  total: number;
}

/** 解析 402 余额不足响应为标准错误串：insufficient_tokens|balance|required
 *  前端据此弹充值引导。非 402 时返回 null。 */
export function parseInsufficient(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const v = body as Record<string, unknown>;
  if (v["error"] !== "insufficient_tokens") return null;
  const balance = typeof v["balance"] === "number" ? v["balance"] : 0;
  const required = typeof v["required"] === "number" ? v["required"] : 0;
  return `insufficient_tokens|${balance}|${required}`;
}

/** GET /api/billing/token/balance */
export async function tokenGetBalance(token: string): Promise<TokenBalance> {
  return api.get<TokenBalance>("/api/billing/token/balance", { token });
}

/** GET /api/billing/token/packages?platform=desktop */
export async function tokenListPackages(token: string): Promise<TokenPackage[]> {
  const list = await api.get<TokenPackageList>("/api/billing/token/packages", {
    token,
    params: { platform: "desktop" },
  });
  return list.items;
}

/** POST /api/billing/token/recharge（native 扫码）
 *  Rust 版返回 code_url 供前端渲染微信扫码二维码。
 *  Electron 版暂未实现原生支付下单，明确报错引导网页支付。 */
export async function tokenRechargeNative(
  _token: string,
  _packageId: string
): Promise<RechargeResult> {
  throw new Error("原生支付暂未在 Electron 版实现，请使用网页支付");
}

/** GET /api/billing/token/transactions */
export async function tokenListTransactions(
  token: string,
  page: number
): Promise<TokenTransactionList> {
  return api.get<TokenTransactionList>("/api/billing/token/transactions", {
    token,
    params: { page: String(page), page_size: "20" },
  });
}

/** 供 market / membership 复用的非 2xx 错误规整，语义对齐 Rust 各命令里的手写错误处理。 */
export function checkStatusError(err: unknown, action: string): never {
  if (err instanceof ApiHttpError) {
    if (err.status === 402) {
      const ins = parseInsufficient(err.body);
      if (ins) throw new Error(ins);
    }
    if (
      err.body &&
      typeof err.body === "object" &&
      typeof (err.body as Record<string, unknown>)["error"] === "string"
    ) {
      throw new Error((err.body as Record<string, string>)["error"]);
    }
    const bodyText =
      typeof err.body === "string" ? err.body : JSON.stringify(err.body ?? "");
    throw new Error(`${action} (${err.status}): ${bodyText}`);
  }
  throw err;
}
