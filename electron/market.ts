/**
 * 牌组市场模块。
 * 移植自 memflow-desktop/src-tauri/src/market.rs，路径/方法与 Rust 版逐字一致。
 * 402 余额不足错误串解析复用 token.ts 的 parseInsufficient / checkStatusError。
 */

import { api, ApiHttpError } from "./http";
import { checkStatusError, parseInsufficient } from "./token";

// ---- Types mirroring the cloud market API responses ----

/** 创作者公开展示信息 */
export interface CreatorBrief {
  id?: string;
  nickname?: string;
  avatar_url?: string;
}

export interface MarketDeckItem {
  id: string;
  title: string;
  description?: string;
  cover_url?: string;
  category?: string;
  pricing_type: string; // free | paid
  price?: number; // 分；ent omitempty，免费卡组 price=0 会被省略
  card_count?: number;
  preview_card_count?: number;
  version?: number;
  sales_count?: number;
  creator?: CreatorBrief;
}

export interface MarketDeckList {
  items: MarketDeckItem[];
  total: number;
}

export interface MarketDeckDetail {
  deck: MarketDeckItem;
  owned: boolean;
}

export interface MarketCard {
  id: string;
  type: string; // JSON 字段为 "type"
  front?: string;
  back?: string;
  sort_order?: number;
}

export interface MarketPreview {
  cards: MarketCard[];
  full: boolean;
  card_count: number;
}

export interface MarketOrder {
  id: string;
  market_deck_id: string;
  amount?: number; // 免费卡组订单 amount=0 会被 omitempty 省略
  payment_channel?: string;
  status: string;
}

export interface ImportedDeck {
  id: string;
  name: string;
}

/** GET /api/market/decks */
export async function marketListDecks(
  token: string,
  opts: {
    category?: string;
    keyword?: string;
    pricing_type?: string;
    sort?: string;
    page?: number;
  } = {}
): Promise<MarketDeckList> {
  const nonEmpty = (s?: string) => (s && s.length > 0 ? s : undefined);
  return api.get<MarketDeckList>("/api/market/decks", {
    token,
    params: {
      page: String(opts.page ?? 1),
      page_size: "20",
      category_id: nonEmpty(opts.category),
      keyword: nonEmpty(opts.keyword),
      pricing_type: nonEmpty(opts.pricing_type),
      sort: nonEmpty(opts.sort),
    },
  });
}

/** GET /api/market/decks/:id */
export async function marketGetDeck(token: string, id: string): Promise<MarketDeckDetail> {
  try {
    return await api.get<MarketDeckDetail>(`/api/market/decks/${id}`, { token });
  } catch (err) {
    if (err instanceof ApiHttpError) checkStatusError(err, "获取卡组详情失败");
    throw err;
  }
}

/** GET /api/market/decks/:id/preview */
export async function marketPreview(token: string, id: string): Promise<MarketPreview> {
  try {
    return await api.get<MarketPreview>(`/api/market/decks/${id}/preview`, { token });
  } catch (err) {
    if (err instanceof ApiHttpError) checkStatusError(err, "获取预览失败");
    throw err;
  }
}

/** POST /api/market/decks/:id/purchase（灵光点扣款；余额不足返回 insufficient_tokens 错误串） */
export async function marketPurchase(token: string, id: string): Promise<MarketOrder> {
  try {
    return await api.post<MarketOrder>(`/api/market/decks/${id}/purchase`, undefined, token);
  } catch (err) {
    if (err instanceof ApiHttpError) checkStatusError(err, "购买失败");
    throw err;
  }
}

/** POST /api/market/decks/:id/import（服务端拷贝卡组，随后前端触发 sync 下拉） */
export async function marketImport(token: string, id: string): Promise<ImportedDeck> {
  try {
    return await api.post<ImportedDeck>(`/api/market/decks/${id}/import`, undefined, token);
  } catch (err) {
    if (err instanceof ApiHttpError) checkStatusError(err, "导入失败");
    throw err;
  }
}

// 保持与 Rust 版一致的复用入口：402 解析即 token.parseInsufficient
export { parseInsufficient };
