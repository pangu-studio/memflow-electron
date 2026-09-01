/**
 * 内容域云端 API 客户端（移植自 memflow-desktop/src-tauri/src/cloud.rs，语义需与 Rust 版保持一致）。
 * 薄客户端：牌组/卡片/分组/统计/设置全部走云端 REST；非 2xx 由 http.ts 统一抛 ApiHttpError。
 *
 * 注意：
 * 1. 请求/响应字段名保持 snake_case，与后端 JSON 契约一致（ent 全字段 omitempty，
 *    零值会从 JSON 消失，响应侧数值字段调用方需自行兜底）。
 * 2. `cloudExportDeck` 只实现云端拉取部分（返回 { file_name, data }，data 为 base64 编码的
 *    .mfdeck 信封 JSON）；base64 解码、保存对话框与本地文件写入由 Electron 主进程 IPC 层组装。
 * 3. 本文件不 import electron，保持纯云端逻辑可测试。
 */

import { api } from "./http";

// ---- DTO ----

export interface Deck {
  id: string;
  name: string;
  description?: string;
  group_id?: string;
  suspended?: boolean;
  due_count?: number;
  /** 市场溯源：从市场导入的卡组非空（禁止导出/再发布） */
  source_market_deck_id?: string;
  market_import_type?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Card {
  id: string;
  deck_id: string;
  deck_name?: string;
  card_type?: string;
  front?: string;
  back?: string;
  tags?: string[];
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CardListResp {
  cards: Card[];
  total?: number;
}

export interface Tag {
  id: string;
  name?: string;
  card_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface TagListResp {
  tags?: Tag[];
  total?: number;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  parent_id?: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ReviewQueueItem {
  card_id: string;
  cloze_num?: number;
  deck_id: string;
  deck_name?: string;
  card_type?: string;
  front?: string;
  back?: string;
  stability?: number;
  difficulty?: number;
  reps?: number;
  lapses?: number;
  state?: number;
  version?: number;
  due?: string;
  last_review?: string;
}

export interface StatsResp {
  today_reviewed?: number;
  due_count?: number;
  total_cards?: number;
  total_reps?: number;
}

export interface ReviewSettingsResp {
  id?: string;
  daily_limit?: number;
  desired_retention?: number;
  maximum_interval?: number;
  w?: string;
  enable_fuzz?: boolean;
  timezone?: string;
}

/** PUT /api/review-settings 请求体：None 字段不序列化（Rust skip_serializing_if） */
export interface UpsertReviewSettingsReq {
  daily_limit?: number;
  desired_retention?: number;
  maximum_interval?: number;
  w?: string;
  enable_fuzz?: boolean;
  timezone?: string;
}

/** 云端加密导出包响应（POST /api/decks/:id/export） */
export interface DeckExportResp {
  file_name: string;
  /** base64 编码的 .mfdeck 信封 JSON */
  data: string;
}

/** 卡片列表查询参数（cloud_list_cards 的 Option 参数对应 TS 可选项） */
export interface ListCardsParams {
  deck_id?: string;
  keyword?: string;
  /** 每个标签一个 tag 查询参数，云端取 AND */
  tag?: string[];
  page?: number;
  page_size?: number;
}

// ---- Decks ----

/** GET /api/decks */
export async function cloudListDecks(token: string): Promise<Deck[]> {
  return api.get<Deck[]>("/api/decks", { token });
}

/** POST /api/decks */
export async function cloudCreateDeck(
  token: string,
  name: string,
  description?: string,
  groupId?: string
): Promise<Deck> {
  const body = {
    name,
    description: description ?? "",
    group_id: groupId ?? null,
  };
  return api.post<Deck>("/api/decks", body, token);
}

/** PUT /api/decks/:id */
export async function cloudUpdateDeck(
  token: string,
  id: string,
  name: string,
  description?: string,
  groupId?: string,
  suspended?: boolean
): Promise<Deck> {
  const body = {
    name,
    description: description ?? "",
    group_id: groupId ?? null,
    suspended: suspended ?? null,
  };
  return api.put<Deck>(`/api/decks/${id}`, body, token);
}

/** DELETE /api/decks/:id */
export async function cloudDeleteDeck(token: string, id: string): Promise<void> {
  await api.delete<void>(`/api/decks/${id}`, token);
}

/**
 * POST /api/decks/:id/export → 拉取云端加密导出包。
 * 市场导入的卡组云端会拒绝导出（防二次售卖闭环）。
 * 仅返回云端数据（file_name + base64 信封）；base64 解码、保存对话框与本地文件写入
 * 由 Electron 主进程 IPC 层组装（对应 Rust 版 tauri_plugin_dialog + fs::write 部分）。
 */
export async function cloudExportDeck(token: string, id: string): Promise<DeckExportResp> {
  return api.post<DeckExportResp>(`/api/decks/${id}/export`, undefined, token);
}

// ---- Cards ----

/** GET /api/cards（tag 多值取 AND：每个标签一个 tag 查询参数） */
export async function cloudListCards(
  token: string,
  params: ListCardsParams = {}
): Promise<CardListResp> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.page_size ?? 20));
  if (params.deck_id) query.set("deck_id", params.deck_id);
  if (params.keyword) query.set("keyword", params.keyword);
  for (const t of params.tag ?? []) {
    if (t) query.append("tag", t);
  }
  return api.get<CardListResp>(`/api/cards?${query.toString()}`, { token });
}

/** POST /api/cards */
export async function cloudCreateCard(
  token: string,
  deckId: string,
  front: string,
  back: string,
  cardType?: string,
  tags?: string[],
  clozeNums?: number[]
): Promise<Card> {
  const body = {
    deck_id: deckId,
    card_type: cardType ?? "qa",
    front,
    back,
    tags: tags ?? [],
    cloze_nums: clozeNums ?? [],
  };
  return api.post<Card>("/api/cards", body, token);
}

/**
 * PUT /api/cards/:id
 * deck_id 传值才包含在请求体中；tags 传 undefined 表示不动标签，传数组（含空数组）表示整体替换；
 * cloze_nums 传值表示按该空号集合对账 CardState，undefined 表示不调整。
 */
export async function cloudUpdateCard(
  token: string,
  id: string,
  deckId: string | undefined,
  front: string,
  back: string,
  cardType: string,
  tags?: string[],
  clozeNums?: number[]
): Promise<Card> {
  const body: Record<string, unknown> = {
    card_type: cardType,
    front,
    back,
  };
  if (deckId !== undefined) body["deck_id"] = deckId;
  if (tags !== undefined) body["tags"] = tags;
  if (clozeNums !== undefined) body["cloze_nums"] = clozeNums;
  return api.put<Card>(`/api/cards/${id}`, body, token);
}

/** DELETE /api/cards/:id */
export async function cloudDeleteCard(token: string, id: string): Promise<void> {
  await api.delete<void>(`/api/cards/${id}`, token);
}

// ---- Tags ----

/** GET /api/tags */
export async function cloudListTags(token: string, keyword?: string): Promise<TagListResp> {
  const params: Record<string, string | undefined> = {};
  if (keyword) params["keyword"] = keyword;
  return api.get<TagListResp>("/api/tags", { token, params });
}

/** PUT /api/tags/:id */
export async function cloudRenameTag(token: string, id: string, name: string): Promise<Tag> {
  return api.put<Tag>(`/api/tags/${id}`, { name }, token);
}

/** DELETE /api/tags/:id */
export async function cloudDeleteTag(token: string, id: string): Promise<void> {
  await api.delete<void>(`/api/tags/${id}`, token);
}

// ---- Groups ----

/** GET /api/groups */
export async function cloudListGroups(token: string): Promise<Group[]> {
  return api.get<Group[]>("/api/groups", { token });
}

/** POST /api/groups */
export async function cloudCreateGroup(
  token: string,
  name: string,
  description?: string,
  icon?: string,
  parentId?: string
): Promise<Group> {
  const body = {
    name,
    description: description ?? "",
    icon: icon ?? null,
    parent_id: parentId ?? null,
  };
  return api.post<Group>("/api/groups", body, token);
}

/** PUT /api/groups/:id */
export async function cloudUpdateGroup(
  token: string,
  id: string,
  name: string,
  description?: string,
  icon?: string,
  parentId?: string
): Promise<Group> {
  const body = {
    name,
    description: description ?? "",
    icon: icon ?? null,
    parent_id: parentId ?? null,
  };
  return api.put<Group>(`/api/groups/${id}`, body, token);
}

/** DELETE /api/groups/:id */
export async function cloudDeleteGroup(token: string, id: string): Promise<void> {
  await api.delete<void>(`/api/groups/${id}`, token);
}

// ---- Review queue / stats / settings ----

/** GET /api/review/queue */
export async function cloudGetReviewQueue(
  token: string,
  deckId?: string
): Promise<ReviewQueueItem[]> {
  const params: Record<string, string | undefined> = {};
  if (deckId) params["deck_id"] = deckId;
  return api.get<ReviewQueueItem[]>("/api/review/queue", { token, params });
}

/** GET /api/review/today（Rust 返回 serde_json::Value，结构以后端为准） */
export async function cloudGetTodayStats(token: string): Promise<unknown> {
  return api.get<unknown>("/api/review/today", { token });
}

/** GET /api/stats（deck_id 非空时按牌组统计总卡片数与待复习数，今日/累计复习云端保持全局口径） */
export async function cloudGetStats(token: string, deckId?: string): Promise<StatsResp> {
  const params: Record<string, string | undefined> = {};
  if (deckId) params["deck_id"] = deckId;
  return api.get<StatsResp>("/api/stats", { token, params });
}

/** GET /api/review-settings */
export async function cloudGetReviewSettings(token: string): Promise<ReviewSettingsResp> {
  return api.get<ReviewSettingsResp>("/api/review-settings", { token });
}

/** PUT /api/review-settings（仅序列化已设置的字段，对应 Rust skip_serializing_if = None） */
export async function cloudUpdateReviewSettings(
  token: string,
  settings: UpsertReviewSettingsReq
): Promise<ReviewSettingsResp> {
  const body: Record<string, unknown> = {};
  if (settings.daily_limit !== undefined) body["daily_limit"] = settings.daily_limit;
  if (settings.desired_retention !== undefined) body["desired_retention"] = settings.desired_retention;
  if (settings.maximum_interval !== undefined) body["maximum_interval"] = settings.maximum_interval;
  if (settings.w !== undefined) body["w"] = settings.w;
  if (settings.enable_fuzz !== undefined) body["enable_fuzz"] = settings.enable_fuzz;
  if (settings.timezone !== undefined) body["timezone"] = settings.timezone;
  return api.put<ReviewSettingsResp>("/api/review-settings", body, token);
}
