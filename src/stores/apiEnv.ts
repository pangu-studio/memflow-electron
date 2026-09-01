import { create } from "zustand";
import { invoke } from "@/lib/invoke";

export interface Environment {
  key: string;
  label: string;
  base: string;
}

interface ApiEnvState {
  buildProfile: string;
  canSwitch: boolean;
  available: Environment[];
  loaded: boolean;

  currentEnv: string;
  currentBase: string;
  saved: boolean;

  load: () => Promise<void>;
  apply: (env: string, customUrl?: string) => Promise<string | null>;
}

export const useApiEnvStore = create<ApiEnvState>()((set) => ({
  buildProfile: "debug",
  canSwitch: false,
  available: [],
  loaded: false,

  currentEnv: "",
  currentBase: "",
  saved: false,

  load: async () => {
    try {
      const resp = await invoke<{
        build_profile: string;
        can_switch: boolean;
        available: Environment[];
      }>("get_api_env");

      set({
        buildProfile: resp.build_profile,
        canSwitch: resp.can_switch,
        available: resp.available,
        loaded: true,
      });
    } catch (e) {
      console.error("get_api_env failed:", e);
    }
  },

  apply: async (env: string, customUrl?: string) => {
    try {
      await invoke("set_api_env", { env, customUrl });
      set({ currentEnv: env, saved: true });
      setTimeout(() => set({ saved: false }), 3000);
      return null;
    } catch (e) {
      return String(e);
    }
  },
}));
