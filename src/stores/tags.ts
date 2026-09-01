import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";
import type { Tag } from "../types";

interface TagsState {
  tags: Tag[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  /** 加载当前用户全部标签（keyword 过滤用于自动补全） */
  loadTags: (keyword?: string) => Promise<void>;
  /** 打标/删卡等操作后卡片数变化，刷新列表 */
  refresh: () => Promise<void>;
  renameTag: (id: string, name: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
}

export const useTagsStore = create<TagsState>()((set, get) => ({
  tags: [],
  loaded: false,
  loading: false,
  error: null,

  loadTags: async (keyword) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ tags: [], loaded: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const resp = await invoke<{ tags: Tag[]; total: number }>(
        "cloud_list_tags",
        { token, keyword: keyword ?? "" }
      );
      set({ tags: resp.tags, loaded: true, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  refresh: async () => {
    await get().loadTags();
  },

  renameTag: async (id, name) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error("未登录");
    await invoke("cloud_rename_tag", { token, id, name });
    await get().loadTags();
  },

  deleteTag: async (id) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error("未登录");
    await invoke("cloud_delete_tag", { token, id });
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }));
  },
}));
