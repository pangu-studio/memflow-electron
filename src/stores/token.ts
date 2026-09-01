import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";

export interface TokenBalance {
  balance: number;
  total_recharged: number;
  total_consumed: number;
}

export interface TokenPackage {
  id: string;
  name: string;
  token_amount: number;
  bonus_amount: number;
  price: number; // 分
  channel_limit: string;
  midas_product_id: string;
  sort_order: number;
}

export interface RechargeResult {
  transaction_id: string;
  amount: number;
  bonus: number;
  price: number;
  payment?: { channel: string; code_url?: string };
}

export interface TokenTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after?: number | null;
  status: string;
  remark?: string | null;
  created_at: string;
}

/** 解析 insufficient_tokens|balance|required 错误串 */
export function parseInsufficient(e: unknown): { balance: number; required: number } | null {
  const msg = String(e);
  if (!msg.startsWith("insufficient_tokens|")) return null;
  const [, balance, required] = msg.split("|");
  return { balance: Number(balance) || 0, required: Number(required) || 0 };
}

interface TokenState {
  balance: TokenBalance | null;
  packages: TokenPackage[];
  transactions: TokenTransaction[];
  loading: boolean;
  loadBalance: () => Promise<void>;
  loadPackages: () => Promise<void>;
  loadTransactions: () => Promise<void>;
  rechargeNative: (packageId: string) => Promise<RechargeResult | null>;
}

export const useTokenStore = create<TokenState>()((set) => ({
  balance: null,
  packages: [],
  transactions: [],
  loading: false,

  loadBalance: async () => {
    const { token } = useAuthStore.getState();
    if (!token) return;
    try {
      const balance = await invoke<TokenBalance>("token_get_balance", { token });
      set({ balance });
    } catch (e) {
      console.error("加载灵光点余额失败", e);
    }
  },

  loadPackages: async () => {
    const { token } = useAuthStore.getState();
    if (!token) return;
    try {
      const packages = await invoke<TokenPackage[]>("token_list_packages", { token });
      set({ packages: packages.slice().sort((a, b) => a.sort_order - b.sort_order) });
    } catch (e) {
      console.error("加载充值档位失败", e);
    }
  },

  loadTransactions: async () => {
    const { token } = useAuthStore.getState();
    if (!token) return;
    try {
      const res = await invoke<{ items: TokenTransaction[] }>("token_list_transactions", {
        token,
        page: 1,
      });
      set({ transactions: res.items });
    } catch (e) {
      console.error("加载灵光点流水失败", e);
    }
  },

  rechargeNative: async (packageId: string) => {
    const { token } = useAuthStore.getState();
    if (!token) return null;
    set({ loading: true });
    try {
      const result = await invoke<RechargeResult>("token_recharge_native", {
        token,
        packageId,
      });
      return result;
    } finally {
      set({ loading: false });
    }
  },
}));

export const fenToYuan = (fen: number) => (fen / 100).toFixed(2);

export const txTypeLabel: Record<string, string> = {
  recharge: "充值",
  bonus: "赠送",
  consume: "消费",
  refund: "退款",
  adjust: "调账",
};
