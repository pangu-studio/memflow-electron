// ---- Card（云端 CardResp） ----

export interface Card {
  id: string;
  deck_id: string;
  deck_name?: string;
  card_type: "qa" | "cloze";
  front: string;
  back: string;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ---- Tag（云端 TagResp） ----

export interface Tag {
  id: string;
  name: string;
  card_count: number;
  created_at: string;
  updated_at: string;
}

// ---- Deck（云端 DeckResp） ----

export interface Deck {
  id: string;
  name: string;
  description: string;
  group_id?: string | null;
  /** 是否暂停参与全局复习调度 */
  suspended?: boolean;
  /** 当前待复习卡片数（云端统计） */
  due_count: number;
  /** 市场溯源：从市场导入的卡组非空（禁止导出/再发布） */
  source_market_deck_id?: string;
  market_import_type?: "free" | "paid";
  created_at: string;
  updated_at: string;
}

// ---- Group（云端 GroupResp） ----

export interface Group {
  id: string;
  name: string;
  description: string;
  icon?: string | null;
  sort_order: number;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Tree display ----

export interface TreeNodeData {
  id: string;
  name: string;
  type: "deck" | "group";
  /** 待复习数；分组节点为含子分组的聚合值（buildTree 时计算） */
  count?: number;
  suspended?: boolean;
  children?: TreeNodeData[];
}

// ---- Review queue（云端 ReviewQueueItem） ----

export interface QueueItem {
  card_id: string;
  cloze_num: number;
  deck_id: string;
  deck_name?: string;
  card_type: string;
  front: string;
  back: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  version: number;
  due: string;
  last_review?: string | null;
}
