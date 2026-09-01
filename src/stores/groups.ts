import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";
import type { Group } from "../types";

/** 云端命令一律需要登录 token；未登录时写操作直接拒绝 */
function requireToken(): string {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error("未登录");
  return token;
}

interface GroupsState {
  groups: Group[];
  loading: boolean;
  error: string | null;

  loadGroups: () => Promise<void>;
  createGroup: (
    name: string,
    description: string,
    parentId?: string
  ) => Promise<Group>;
  updateGroup: (
    id: string,
    name: string,
    description: string,
    parentId?: string
  ) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
}

export const useGroupsStore = create<GroupsState>()((set) => ({
  groups: [],
  loading: false,
  error: null,

  loadGroups: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ groups: [], loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const groups = await invoke<Group[]>("cloud_list_groups", { token });
      set({ groups, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createGroup: async (name, description, parentId) => {
    const token = requireToken();
    const group = await invoke<Group>("cloud_create_group", {
      token,
      name,
      description,
      icon: null,
      parentId: parentId ?? null,
    });
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  updateGroup: async (id, name, description, parentId) => {
    const token = requireToken();
    const updated = await invoke<Group>("cloud_update_group", {
      token,
      id,
      name,
      description,
      icon: null,
      parentId: parentId ?? null,
    });
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? updated : g)),
    }));
  },

  deleteGroup: async (id) => {
    const token = requireToken();
    await invoke("cloud_delete_group", { token, id });
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
    }));
  },
}));
