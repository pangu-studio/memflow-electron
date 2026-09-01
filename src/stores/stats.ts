import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";

export interface ReviewStats {
  today_reviewed: number;
  total_reps: number;
  total_cards: number;
  /** 当前待复习卡片数 */
  due_count: number;
}

interface StatsStore {
  stats: ReviewStats | null;
  loading: boolean;
  /**
   * 当前统计口径：null = 全局；否则为牌组 ID。
   * 云端在 deck_id 口径下只过滤总卡片数与待复习数，今日/累计复习仍为全局。
   */
  scopeDeckId: string | null;
  /** 按指定口径加载统计（同时切换口径） */
  loadStats: (deckId?: string | null) => Promise<void>;
  /** 按当前口径重新拉取（增删卡片/牌组、复习完成后调用） */
  refresh: () => Promise<void>;
}

export const useStatsStore = create<StatsStore>((set, get) => ({
  stats: null,
  loading: false,
  scopeDeckId: null,

  loadStats: async (deckId) => {
    // 口径先落库，refresh 会沿用它
    const scope = deckId ?? null;
    set({ scopeDeckId: scope });
    const token = useAuthStore.getState().token;
    if (!token) return;
    set({ loading: true });
    try {
      const [stats, today] = await Promise.all([
        invoke<{
          today_reviewed: number;
          due_count: number;
          total_cards: number;
          total_reps: number;
        }>("cloud_get_stats", { token, deckId: scope }),
        invoke<{ reviewed: number }>("cloud_get_today_stats", { token }),
      ]);
      // 快速切换牌组时旧口径的响应后返回，直接丢弃，避免覆盖新口径结果
      if (get().scopeDeckId !== scope) return;
      set({
        stats: {
          today_reviewed: today.reviewed ?? stats.today_reviewed,
          total_reps: stats.total_reps,
          total_cards: stats.total_cards,
          due_count: stats.due_count,
        },
        loading: false,
      });
    } catch (e) {
      console.error("加载统计数据失败", e);
      set({ loading: false });
    }
  },

  refresh: async () => {
    // 按当前口径重拉（loadStats 重设同一口径，内部已处理并发丢弃）
    await get().loadStats(get().scopeDeckId);
  },
}));
