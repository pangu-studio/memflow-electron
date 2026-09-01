import { create } from "zustand";
import { invoke } from "@/lib/invoke";
import { useToastStore } from "./toast";
import { resetAccountScopedStores } from "./reset";

export interface UserProfile {
  id: string;
  email?: string;
  nickname?: string;
  avatar_url?: string;
  phone?: string;
  login_type: string;
}

/** 账号列表条目（auth_list_accounts 返回，不含 token） */
export interface AccountSummary {
  key: string;
  user_id: string;
  env: string;
  nickname?: string;
  email?: string;
  avatar_url?: string;
  login_type: string;
  last_used_at: string;
  is_current: boolean;
  /** 条目 env 是否为当前生效环境（异 env 条目 UI 灰显） */
  is_current_env: boolean;
}

interface AuthState {
  // Auth state
  token: string | null;
  user: UserProfile | null;
  isLoggedIn: boolean;
  needBindEmail: boolean;

  // 多账号
  accounts: AccountSummary[];
  /** 每次登录/切换自增；App 以其为 key 强制路由整树重挂载，触发数据重载 */
  accountEpoch: number;
  /** 切换进行中（菜单禁用防连点） */
  switching: boolean;

  // Login dialog state
  loginDialogOpen: boolean;
  /** bindEmail = 微信登录后绑邮箱；addAccount = 账号菜单"添加账号" */
  loginDialogMode: "bindEmail" | "addAccount";

  // QR login state
  qrId: string | null;
  qrUrl: string | null;
  qrImg: string | null; // 微信官方登录二维码（data URI），优先于 qrUrl 展示
  qrStatus: string;
  qrHint: string;

  // Actions
  init: () => Promise<void>;
  openLoginDialog: (mode?: "bindEmail" | "addAccount") => void;
  closeLoginDialog: () => void;
  startQRLogin: () => Promise<void>;
  emailLogin: (email: string, password: string) => Promise<string | null>;
  bindEmail: (email: string, password: string) => Promise<string | null>;
  fetchProfile: () => Promise<void>;
  /** 登录成功后建档：upsert 条目并置为 current，刷新账号列表 */
  registerAccount: (token: string, profile: UserProfile) => Promise<void>;
  /** 快速切换到已登录账号 */
  switchAccount: (key: string) => Promise<void>;
  /** 移除账号（仅限非当前账号，UI 保证） */
  removeAccount: (key: string) => Promise<void>;
  /** 登出 = 移除当前账号；还有其他账号时自动切到最近使用者 */
  logout: () => Promise<void>;
  resetQR: () => void;
}

// QR 登录会话计数器：每次 startQRLogin/resetQR/logout 自增，
// 串行轮询循环检测到会话号变化即退出，避免幽灵轮询。
let qrSession = 0;

/* ── token 持久化：Rust 侧共享存储（GUI 与 CLI 唯一事实来源） ── */

async function loadPersistedToken(): Promise<string | null> {
  const saved = await invoke<string | null>("auth_load_token");
  if (saved) return saved;
  // 一次性迁移：旧版 token 存在 WebView localStorage
  const legacy = localStorage.getItem("memflow_token");
  if (legacy) {
    localStorage.removeItem("memflow_token");
    await invoke("auth_save_token", { token: legacy });
    return legacy;
  }
  return null;
}

async function clearPersistedToken() {
  await invoke("auth_clear_token");
}

function snapshotToUser(a: AccountSummary): UserProfile {
  return {
    id: a.user_id,
    email: a.email,
    nickname: a.nickname,
    avatar_url: a.avatar_url,
    login_type: a.login_type,
  };
}

export const useAuthStore = create<AuthState>()((set, get) => {
  // 串行轮询：同一时刻只有一个 auth_poll_qr 长轮询在飞，
  // scanned 后立即进入下一轮等待 authorized，避免并发消费一次性 token。
  const runQRPollLoop = async (session: number) => {
    while (session === qrSession) {
      const { qrId } = get();
      if (!qrId) return;
      let resp: {
        status: string;
        token?: string;
        hint?: string;
        need_bind_email?: boolean;
      };
      try {
        resp = await invoke<typeof resp>("auth_poll_qr", { qrId });
      } catch {
        if (session !== qrSession) return;
        set({ qrStatus: "expired", qrHint: "登录失败，请重试" });
        return;
      }
      if (session !== qrSession) return;
      set({ qrStatus: resp.status, qrHint: resp.hint || "" });
      if (resp.status === "authorized" && resp.token) {
        const token = resp.token;
        const needBind = resp.need_bind_email || false;
        set({ token, isLoggedIn: true, needBindEmail: needBind });
        try {
          const profile = await invoke<UserProfile>("auth_get_profile", {
            token,
          });
          if (session !== qrSession) return;
          await get().registerAccount(token, profile);
          set((s) => ({ user: profile, accountEpoch: s.accountEpoch + 1 }));
        } catch {
          // profile 拉取失败不阻断登录（下次 init 再建档）
        }
        if (!needBind) {
          set({ loginDialogOpen: false });
        }
        return;
      }
      if (resp.status === "expired") return;
      // scanned：立即继续下一轮，等待用户在手机上确认
    }
  };

  /** 切换/登出前尽力冲刷当前账号的离线评分队列 */
  const flushOutbox = async () => {
    const { token, user } = get();
    if (!token || !user) return;
    try {
      const { useSettingsStore } = await import("./settings");
      const { parameters, desiredRetention } =
        useSettingsStore.getState().getFsrsParams();
      await invoke("flush_pending_reviews", {
        token,
        userId: user.id,
        parameters: parameters ?? null,
        desiredRetention: desiredRetention ?? null,
      });
    } catch {
      // 离线静默，队列按账号保留待切回后续传
    }
  };

  return {
  token: null,
  user: null,
  isLoggedIn: false,
  needBindEmail: false,
  accounts: [],
  accountEpoch: 0,
  switching: false,
  loginDialogOpen: false,
  loginDialogMode: "bindEmail",
  qrId: null,
  qrUrl: null,
  qrImg: null,
  qrStatus: "idle",
  qrHint: "",

  init: async () => {
    const accounts = await invoke<AccountSummary[]>("auth_list_accounts");
    set({ accounts });
    const saved = await loadPersistedToken();
    if (saved) {
      set({ token: saved });
      try {
        const profile = await invoke<UserProfile>("auth_get_profile", {
          token: saved,
        });
        set({ user: profile, isLoggedIn: true });
        // 旧版单账号文件 → 惰性建档（profile 已成功，user_id 已知）
        if (!accounts.some((a) => a.is_current)) {
          await get().registerAccount(saved, profile);
        }
        return;
      } catch {
        // current token 失效：移除该账号，尝试落到最近使用的其他账号
        await clearPersistedToken();
        set({ token: null });
        const remaining = await invoke<AccountSummary[]>("auth_list_accounts");
        set({ accounts: remaining });
        const next = remaining[0];
        if (next) {
          await get().switchAccount(next.key);
          return;
        }
      }
    }
    // 无有效 token —— 停留在未登录状态，由 App 渲染全屏登录页
  },

  openLoginDialog: (mode = "bindEmail") =>
    set({ loginDialogOpen: true, loginDialogMode: mode }),
  closeLoginDialog: () => set({ loginDialogOpen: false }),

  startQRLogin: async () => {
    const session = ++qrSession;
    set({ qrStatus: "generating", qrHint: "正在生成二维码..." });
    try {
      const resp = await invoke<{
        qr_id: string;
        qr_url: string;
        qr_img?: string;
      }>("auth_request_qr");
      if (session !== qrSession) return;
      set({
        qrId: resp.qr_id,
        qrUrl: resp.qr_url,
        qrImg: resp.qr_img || null,
        qrStatus: "pending",
        qrHint: "请使用微信扫码登录",
      });
      void runQRPollLoop(session);
    } catch {
      if (session !== qrSession) return;
      set({ qrStatus: "expired", qrHint: "生成二维码失败，请重试" });
    }
  },

  emailLogin: async (email: string, password: string) => {
    try {
      const resp = await invoke<{ token: string; need_bind_email?: boolean }>(
        "auth_email_login",
        { email, password }
      );
      set({
        token: resp.token,
        isLoggedIn: true,
        needBindEmail: resp.need_bind_email || false,
      });
      try {
        const profile = await invoke<UserProfile>("auth_get_profile", {
          token: resp.token,
        });
        await get().registerAccount(resp.token, profile);
        set((s) => ({ user: profile, accountEpoch: s.accountEpoch + 1 }));
      } catch {
        await get().fetchProfile();
      }
      return null;
    } catch (e) {
      return String(e);
    }
  },

  bindEmail: async (email: string, password: string) => {
    const { token } = get();
    if (!token) return "未登录";
    try {
      const resp = await invoke<{ token: string }>("auth_bind_email", {
        token,
        email,
        password,
      });
      // 绑定后换发新 token：同 user_id upsert 覆盖旧 token
      set({ token: resp.token, needBindEmail: false });
      const profile = await invoke<UserProfile>("auth_get_profile", {
        token: resp.token,
      });
      await get().registerAccount(resp.token, profile);
      set({ user: profile });
      return null;
    } catch (e) {
      return String(e);
    }
  },

  fetchProfile: async () => {
    const { token } = get();
    if (!token) return;
    try {
      const profile = await invoke<UserProfile>("auth_get_profile", { token });
      set({ user: profile });
    } catch {
      // token invalid
    }
  },

  registerAccount: async (token: string, profile: UserProfile) => {
    await invoke("auth_register_account", { token, profile });
    const accounts = await invoke<AccountSummary[]>("auth_list_accounts");
    set({ accounts });
  },

  switchAccount: async (key: string) => {
    if (get().switching) return;
    const epoch = get().accountEpoch + 1;
    qrSession++;
    set({ switching: true, accountEpoch: epoch });
    try {
      // 先把当前账号的离线评分尽量冲刷（离线静默失败，队列按账号保留）
      await flushOutbox();

      const res = await invoke<{
        token: string;
        account: AccountSummary;
      }>("auth_switch_account", { key });
      if (get().accountEpoch !== epoch) return;

      // 先用快照即时切换 + 重置账号相关缓存，再网络校验
      set({
        token: res.token,
        user: snapshotToUser(res.account),
        isLoggedIn: true,
        needBindEmail: false,
        loginDialogOpen: false,
        qrId: null,
        qrUrl: null,
        qrImg: null,
        qrStatus: "idle",
        qrHint: "",
        accounts: await invoke<AccountSummary[]>("auth_list_accounts"),
      });
      resetAccountScopedStores();

      try {
        const profile = await invoke<UserProfile>("auth_get_profile", {
          token: res.token,
        });
        if (get().accountEpoch !== epoch) return;
        set({ user: profile });
        // 回写最新 profile 快照
        await get().registerAccount(res.token, profile);
      } catch {
        // 该账号 token 已失效：移除并回退
        if (get().accountEpoch !== epoch) return;
        const removed = await invoke<{
          remaining: AccountSummary[];
          suggested_next?: AccountSummary;
        }>("auth_remove_account", { key });
        set({ accounts: removed.remaining });
        useToastStore
          .getState()
          .addToast("error", "该账号登录已失效，已移除");
        const next = removed.suggested_next ?? removed.remaining[0];
        if (next) {
          // 先复位 switching 再递归切换（入口的 switching 守卫会拦截嵌套调用）
          set({ switching: false });
          await get().switchAccount(next.key);
        } else {
          resetAccountScopedStores();
          set({ token: null, user: null, isLoggedIn: false });
        }
      }
    } finally {
      set({ switching: false });
    }
  },

  removeAccount: async (key: string) => {
    await invoke("auth_remove_account", { key });
    const accounts = await invoke<AccountSummary[]>("auth_list_accounts");
    set({ accounts });
  },

  logout: async () => {
    qrSession++;
    const current = get().accounts.find((a) => a.is_current);
    if (current) {
      // 登出 = 移除当前账号；还有其他账号时自动切到最近使用者
      const res = await invoke<{
        remaining: AccountSummary[];
        suggested_next?: AccountSummary;
      }>("auth_remove_account", { key: current.key });
      set({ accounts: res.remaining });
      const next = res.suggested_next ?? res.remaining[0];
      if (next) {
        await get().switchAccount(next.key);
        return;
      }
    } else {
      await clearPersistedToken();
    }
    resetAccountScopedStores();
    set((s) => ({
      token: null,
      user: null,
      isLoggedIn: false,
      needBindEmail: false,
      loginDialogOpen: false,
      qrId: null,
      qrUrl: null,
      qrImg: null,
      qrStatus: "idle",
      qrHint: "",
      accountEpoch: s.accountEpoch + 1,
    }));
  },

  resetQR: () => {
    qrSession++;
    set({ qrId: null, qrUrl: null, qrImg: null, qrStatus: "idle", qrHint: "" });
  },
  };
});
