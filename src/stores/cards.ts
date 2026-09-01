import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";
import { useTagsStore } from "./tags";
import { useStatsStore } from "./stats";
import { useUIStore } from "./ui";
import { clozeNums } from "../utils/cloze";
import type { Card } from "../types";

/** 牌组卡片列表每页拉取条数（云端 page_size 上限 100） */
const DECK_PAGE_SIZE = 100;

/** 云端命令一律需要登录 token；未登录时写操作直接拒绝 */
function requireToken(): string {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error("未登录");
  return token;
}

interface CardsState {
  cards: Card[];
  /** 当前列表所属牌组的卡片总数（云端分页 total） */
  total: number;
  /** 已加载到的页码（从 1 开始，随 loadMoreCards 递增） */
  page: number;
  selectedCard: Card | null;
  searchResults: Card[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  // Deck id whose cards are currently in `cards` (after a successful load).
  // Used to know when the visible list belongs to the route's deck.
  cardsLoadedDeckId: string | null;
  // A card id requested for focus from the search panel, to be resolved once
  // that card's deck finishes loading in DeckDetail (filters the list to it).
  pendingFocusCardId: string | null;

  loadCardsByDeck: (deckId: string) => Promise<void>;
  loadMoreCards: (deckId: string) => Promise<void>;
  createCard: (
    deckId: string,
    front: string,
    back: string,
    cardType?: string,
    tags?: string[]
  ) => Promise<Card>;
  updateCard: (
    id: string,
    front: string,
    back: string,
    cardType: string,
    tags?: string[]
  ) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  searchCards: (query: string, tags?: string[]) => Promise<void>;
  selectCard: (card: Card | null) => void;
  requestFocusCard: (id: string) => void;
  clearPendingFocusCard: () => void;
  clearSearch: () => void;
}

export const useCardsStore = create<CardsState>()((set, get) => ({
  cards: [],
  total: 0,
  page: 1,
  selectedCard: null,
  searchResults: [],
  loading: false,
  loadingMore: false,
  error: null,
  cardsLoadedDeckId: null,
  pendingFocusCardId: null,

  loadCardsByDeck: async (deckId) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ cards: [], total: 0, page: 1, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      // 云端 page_size 上限 100，超过会被重置为 20
      const resp = await invoke<{ cards: Card[]; total: number }>(
        "cloud_list_cards",
        { token, deckId, page: 1, pageSize: DECK_PAGE_SIZE }
      );
      // Stamp the deck id atomically with the cards so consumers can tell when
      // the visible list actually belongs to a given deck.
      set({
        cards: resp.cards,
        total: resp.total,
        page: 1,
        loading: false,
        cardsLoadedDeckId: deckId,
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  loadMoreCards: async (deckId) => {
    const s = get();
    // 并发守卫 + 仅追加当前牌组 + 还有未拉取的卡片时才请求
    if (s.loadingMore || s.loading || s.cardsLoadedDeckId !== deckId) return;
    if (s.cards.length >= s.total) return;
    const token = useAuthStore.getState().token;
    if (!token) return;
    const nextPage = s.page + 1;
    set({ loadingMore: true, error: null });
    try {
      const resp = await invoke<{ cards: Card[]; total: number }>(
        "cloud_list_cards",
        { token, deckId, page: nextPage, pageSize: DECK_PAGE_SIZE }
      );
      set((cur) => {
        // 期间切换了牌组则丢弃本页结果
        if (cur.cardsLoadedDeckId !== deckId) return { loadingMore: false };
        // 按 id 去重，防御翻页期间并发新建/同步导致页错位
        const seen = new Set(cur.cards.map((c) => c.id));
        return {
          cards: [...cur.cards, ...resp.cards.filter((c) => !seen.has(c.id))],
          total: resp.total,
          page: nextPage,
          loadingMore: false,
        };
      });
    } catch (e) {
      set({ error: String(e), loadingMore: false });
    }
  },

  createCard: async (deckId, front, back, cardType, tags) => {
    const token = requireToken();
    const card = await invoke<Card>("cloud_create_card", {
      token,
      deckId,
      front,
      back,
      cardType: cardType ?? "qa",
      tags: tags ?? [],
      clozeNums: clozeNums(front),
    });
    set((s) => ({ cards: [...s.cards, card], total: s.total + 1 }));
    // 新标签可能随创建产生，刷新标签词汇表（fire-and-forget）
    useTagsStore.getState().refresh().catch(() => {});
    // 卡片总数/待复习已变，按当前口径刷新右侧统计
    useStatsStore.getState().refresh().catch(() => {});
    return card;
  },

  updateCard: async (id, front, back, cardType, tags) => {
    const token = requireToken();
    const updated = await invoke<Card>("cloud_update_card", {
      token,
      id,
      front,
      back,
      cardType,
      tags: tags ?? [],
      clozeNums: clozeNums(front),
    });
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? updated : c)),
      selectedCard: s.selectedCard?.id === id ? updated : s.selectedCard,
    }));
    useTagsStore.getState().refresh().catch(() => {});
  },

  deleteCard: async (id) => {
    const token = requireToken();
    await invoke("cloud_delete_card", { token, id });
    set((s) => ({
      cards: s.cards.filter((c) => c.id !== id),
      total: Math.max(0, s.total - 1),
      selectedCard: s.selectedCard?.id === id ? null : s.selectedCard,
    }));
    useTagsStore.getState().refresh().catch(() => {});
    useStatsStore.getState().refresh().catch(() => {});
  },

  searchCards: async (query, tags) => {
    if (!query.trim() && (!tags || tags.length === 0)) {
      set({ searchResults: [] });
      return;
    }
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ searchResults: [] });
      return;
    }
    try {
      const resp = await invoke<{ cards: Card[]; total: number }>(
        "cloud_list_cards",
        { token, keyword: query, tag: tags ?? [], pageSize: 50 }
      );
      set({ searchResults: resp.cards });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectCard: (card) => {
    set({ selectedCard: card });
    // 选中卡片时自动切到「信息」tab，点击有即时反馈（重复点同一张也生效）
    if (card) useUIStore.getState().setRightTab("info");
  },

  // Record a card chosen from the search panel; DeckDetail resolves it once the
  // owning deck's cards are loaded, filtering the list to that single card.
  requestFocusCard: (id) => {
    set({ pendingFocusCardId: id });
  },

  clearPendingFocusCard: () => {
    set({ pendingFocusCardId: null });
  },

  clearSearch: () => {
    set({ searchResults: [] });
  },
}));
