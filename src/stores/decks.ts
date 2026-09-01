import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";
import { useStatsStore } from "./stats";
import type { Deck } from "../types";

/** 云端命令一律需要登录 token；未登录时写操作直接拒绝 */
function requireToken(): string {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error("未登录");
  return token;
}

interface DecksState {
  decks: Deck[];
  currentDeck: Deck | null;
  loading: boolean;
  error: string | null;

  loadDecks: () => Promise<void>;
  loadDeck: (id: string) => Promise<void>;
  createDeck: (
    name: string,
    description: string,
    groupId?: string
  ) => Promise<Deck>;
  updateDeck: (
    id: string,
    name: string,
    description: string,
    groupId?: string
  ) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  /** 暂停/恢复牌组的全局复习调度 */
  setDeckSuspended: (id: string, suspended: boolean) => Promise<void>;
  /** 导出牌组为 .mfdeck 加密包，返回保存路径（用户取消返回空串） */
  exportDeck: (id: string) => Promise<string>;
}

export const useDecksStore = create<DecksState>()((set, get) => ({
  decks: [],
  currentDeck: null,
  loading: false,
  error: null,

  loadDecks: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ decks: [], loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const decks = await invoke<Deck[]>("cloud_list_decks", { token });
      set({ decks, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  loadDeck: async (id) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      // 云端无单个获取端点，列表 + 查找
      const decks = await invoke<Deck[]>("cloud_list_decks", { token });
      const deck = decks.find((d) => d.id === id) ?? null;
      set({ decks, currentDeck: deck, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createDeck: async (name, description, groupId) => {
    const token = requireToken();
    const deck = await invoke<Deck>("cloud_create_deck", {
      token,
      name,
      description,
      groupId: groupId ?? null,
    });
    set((s) => ({ decks: [deck, ...s.decks] }));
    return deck;
  },

  updateDeck: async (id, name, description, groupId) => {
    const token = requireToken();
    const updated = await invoke<Deck>("cloud_update_deck", {
      token,
      id,
      name,
      description,
      groupId: groupId ?? null,
    });
    set((s) => ({
      decks: s.decks.map((d) => (d.id === id ? updated : d)),
      currentDeck: s.currentDeck?.id === id ? updated : s.currentDeck,
    }));
  },

  setDeckSuspended: async (id, suspended) => {
    const token = requireToken();
    // cloud_update_deck 为全字段写：必须带上当前 name/description/groupId，否则会被清空
    const current =
      get().decks.find((d) => d.id === id) ??
      (get().currentDeck?.id === id ? get().currentDeck : null);
    if (!current) throw new Error("牌组不存在");
    const updated = await invoke<Deck>("cloud_update_deck", {
      token,
      id,
      name: current.name,
      description: current.description ?? "",
      groupId: current.group_id ?? null,
      suspended,
    });
    set((s) => ({
      decks: s.decks.map((d) => (d.id === id ? updated : d)),
      currentDeck: s.currentDeck?.id === id ? updated : s.currentDeck,
    }));
  },

  deleteDeck: async (id) => {
    const token = requireToken();
    await invoke("cloud_delete_deck", { token, id });
    set((s) => ({
      decks: s.decks.filter((d) => d.id !== id),
      currentDeck: s.currentDeck?.id === id ? null : s.currentDeck,
    }));
    // 牌组下卡片一并删除，卡片总数/待复习已变，按当前口径刷新统计
    useStatsStore.getState().refresh().catch(() => {});
  },

  exportDeck: async (id) => {
    const token = requireToken();
    return await invoke<string>("cloud_export_deck", { token, id });
  },
}));
