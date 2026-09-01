import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";

export interface ReviewSettings {
  id: string;
  daily_limit: number;
  desired_retention: number;
  maximum_interval: number;
  /** FSRS 权重（JSON 字符串，"[]" 或空串 = 默认参数） */
  w: string;
  enable_fuzz: boolean;
  timezone: string;
}

interface SettingsState {
  settings: ReviewSettings | null;
  loading: boolean;
  error: string | null;

  /** 加载当前用户的复习设置 */
  load: () => Promise<void>;

  /** 保存设置 */
  save: (values: {
    daily_limit: number;
    desired_retention: number;
    maximum_interval: number;
    w: string;
    enable_fuzz: boolean;
  }) => Promise<void>;

  /** 重置为默认值 */
  resetDefaults: () => Promise<void>;

  /** 解析 FSRS 参数，供 submit_review / flush_pending_reviews 使用 */
  getFsrsParams: () => {
    parameters: number[] | null;
    desiredRetention: number | null;
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  error: null,

  load: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const data = await invoke<ReviewSettings>("cloud_get_review_settings", {
        token,
      });
      set({ settings: data, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  save: async (values) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error("未登录");
    set({ loading: true, error: null });
    try {
      const data = await invoke<ReviewSettings>("cloud_update_review_settings", {
        token,
        settings: values,
      });
      set({ settings: data, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  resetDefaults: async () => {
    const { save } = get();
    await save({
      daily_limit: 50,
      desired_retention: 0.9,
      maximum_interval: 36500,
      w: "[]",
      enable_fuzz: true,
    });
  },

  getFsrsParams: () => {
    const s = get().settings;
    let parameters: number[] | null = null;
    if (s?.w && s.w !== "[]") {
      try {
        const parsed = JSON.parse(s.w);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parameters = parsed;
        }
      } catch {
        // ignore parse error — fall back to defaults
      }
    }
    return { parameters, desiredRetention: s?.desired_retention ?? null };
  },
}));
