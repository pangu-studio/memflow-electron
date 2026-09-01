import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";

export interface CreatorBrief {
  id: string;
  nickname: string;
  avatar_url: string;
}

export interface MarketDeckItem {
  id: string;
  title: string;
  description: string;
  cover_url: string;
  category: string;
  pricing_type: "free" | "paid";
  price: number; // 分
  card_count: number;
  preview_card_count: number;
  version: number;
  sales_count: number;
  creator?: CreatorBrief;
}

export interface MarketCard {
  id: string;
  card_type: string;
  front: string;
  back: string;
  sort_order: number;
}

interface MarketState {
  items: MarketDeckItem[];
  total: number;
  loading: boolean;
  loadDecks: (opts?: { keyword?: string; pricingType?: string; sort?: string; page?: number }) => Promise<void>;
  getDeck: (id: string) => Promise<{ deck: MarketDeckItem; owned: boolean }>;
  preview: (id: string) => Promise<{ cards: MarketCard[]; full: boolean; card_count: number }>;
  purchase: (id: string) => Promise<void>;
  importDeck: (id: string) => Promise<{ id: string; name: string }>;
}

export const useMarketStore = create<MarketState>()((set) => ({
  items: [],
  total: 0,
  loading: false,

  loadDecks: async (opts) => {
    const { token } = useAuthStore.getState();
    if (!token) return;
    set({ loading: true });
    try {
      const res = await invoke<{ items: MarketDeckItem[]; total: number }>("market_list_decks", {
        token,
        category: null,
        keyword: opts?.keyword ?? null,
        pricingType: opts?.pricingType ?? null,
        sort: opts?.sort ?? "sales",
        page: opts?.page ?? 1,
      });
      set({ items: res.items, total: res.total, loading: false });
    } catch (e) {
      console.error("加载市场卡组失败", e);
      set({ loading: false });
    }
  },

  getDeck: async (id) => {
    const { token } = useAuthStore.getState();
    return await invoke<{ deck: MarketDeckItem; owned: boolean }>("market_get_deck", { token, id });
  },

  preview: async (id) => {
    const { token } = useAuthStore.getState();
    return await invoke<{ cards: MarketCard[]; full: boolean; card_count: number }>(
      "market_preview",
      { token, id },
    );
  },

  purchase: async (id) => {
    const { token } = useAuthStore.getState();
    await invoke("market_purchase", { token, id });
  },

  importDeck: async (id) => {
    const { token } = useAuthStore.getState();
    return await invoke<{ id: string; name: string }>("market_import", { token, id });
  },
}));

export const fenToYuan = (fen: number) => (fen / 100).toFixed(2);
