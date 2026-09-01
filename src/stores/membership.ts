import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useAuthStore } from "./auth";

export interface MembershipPlan {
  id: string;
  name: string;
  slug: string;
  tier: number;
  deck_limit: number;
  card_limit_per_deck: number;
  sync_enabled: boolean;
  monthly_price: number;
  annual_price: number;
  annual_discount_label: string;
  sort_order: number;
  is_active: boolean;
}

export interface SubscriptionInfo {
  tier: string;
  membership_expires_at?: string | null;
  plan_name?: string;
  status?: string;
  period?: string;
  expires_at?: string | null;
  auto_renew: boolean;
  deck_limit: number;
  card_limit_per_deck: number;
}

export interface JsapiPayment {
  app_id: string;
  time_stamp: string;
  nonce_str: string;
  package: string;
  sign_type: string;
  pay_sign: string;
}

export interface PaymentInfo {
  channel: string;
  prepay_id?: string;
  code_url?: string;
  jsapi?: JsapiPayment;
}

export interface SubscribeResult {
  subscription_id: string;
  plan_name: string;
  period: string;
  amount: number;
  payment?: PaymentInfo;
}

export interface UserQuota {
  tier: string;
  deck_count: number;
  /** 0 = 无限制 */
  deck_limit: number;
  /** 0 = 无限制 */
  card_limit_per_deck: number;
  sync_enabled: boolean;
  cached_at?: string;
}

interface MembershipState {
  plans: MembershipPlan[];
  subscription: SubscriptionInfo | null;
  /** 本地配额缓存（sync_meta.quota_cache），同步后自动刷新 */
  quota: UserQuota | null;
  loading: boolean;
  subscribing: boolean;
  loadPlans: () => Promise<void>;
  loadStatus: () => Promise<void>;
  loadQuotaCache: () => Promise<void>;
  refreshQuota: () => Promise<void>;
  subscribeNative: (planId: string, period: string) => Promise<SubscribeResult | null>;
}

export const useMembershipStore = create<MembershipState>()((set, get) => ({
  plans: [],
  subscription: null,
  quota: null,
  loading: false,
  subscribing: false,

  loadPlans: async () => {
    try {
      const plans = await invoke<MembershipPlan[]>("membership_list_plans");
      set({ plans });
    } catch (e) {
      console.error("加载会员方案失败", e);
    }
  },

  loadStatus: async () => {
    const { token } = useAuthStore.getState();
    if (!token) return;
    set({ loading: true });
    try {
      const info = await invoke<SubscriptionInfo>("membership_get_status", { token });
      set({ subscription: info, loading: false });
    } catch (e) {
      console.error("加载会员状态失败", e);
      set({ loading: false });
    }
  },

  loadQuotaCache: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    try {
      const quota = await invoke<UserQuota | null>("membership_get_quota_cache", {
        userId: user.id,
      });
      set({ quota });
    } catch (e) {
      console.error("读取配额缓存失败", e);
    }
  },

  refreshQuota: async () => {
    const { token, user } = useAuthStore.getState();
    if (!token || !user) return;
    try {
      const quota = await invoke<UserQuota>("membership_refresh_quota", {
        token,
        userId: user.id,
      });
      set({ quota });
    } catch (e) {
      console.error("刷新配额失败", e);
    }
  },

  subscribeNative: async (planId: string, period: string) => {
    const { token } = useAuthStore.getState();
    if (!token) return null;
    set({ subscribing: true });
    try {
      const result = await invoke<SubscribeResult>("membership_subscribe_native", {
        token,
        planId,
        period,
      });
      set({ subscribing: false });
      // 订阅/升级成功后立即刷新配额缓存（被拒实体可随之重推）
      void get().refreshQuota();
      return result;
    } catch (e) {
      set({ subscribing: false });
      throw e;
    }
  },
}));

// 分转元
export const fenToYuan = (fen: number) => (fen / 100).toFixed(2);

// 会员等级展示
export const tierLabel: Record<string, string> = {
  free: "免费用户",
  vip: "VIP",
  svip: "超级VIP",
};
