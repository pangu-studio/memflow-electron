/**
 * 认证（移植自 memflow-desktop/src-tauri/src/auth.rs）。
 * 微信扫码轮询、邮箱登录/绑定、profile；token 与多账号存储见 authToken.ts / accounts.ts。
 */
import { api } from "./http";
import { currentEnvKey } from "./config";
import * as authToken from "./authToken";
import * as accounts from "./accounts";
import { claimAnonymousReviews } from "./db";

export interface QRStateResponse {
  qr_id: string;
  qr_url: string;
  /** 微信官方登录二维码图片（data URI） */
  qr_img?: string;
  expire?: number;
}

export interface QRPollResponse {
  status: string;
  token?: string;
  hint?: string;
  need_bind_email?: boolean;
}

export interface LoginResponse {
  token: string;
  need_bind_email?: boolean;
}

export interface UserProfile {
  id: string;
  email?: string;
  nickname?: string;
  avatar_url?: string;
  phone?: string;
  login_type: string;
}

export async function authRequestQr(): Promise<QRStateResponse> {
  return api.post<QRStateResponse>("/api/auth/wechat/qr/state");
}

/** 轮询二维码状态：每 1 秒一次，最多 300 次（5 分钟）；scanned 也立即返回供前端展示遮罩 */
export async function authPollQr(qrId: string): Promise<QRPollResponse> {
  for (let i = 0; i < 300; i++) {
    const poll = await api.get<QRPollResponse>(`/api/auth/wechat/qr/state/${qrId}`);
    if (poll.status === "authorized" || poll.status === "expired" || poll.status === "scanned") {
      return poll;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { status: "expired", hint: "QR code expired" };
}

export async function authEmailLogin(email: string, password: string): Promise<LoginResponse> {
  try {
    return await api.post<LoginResponse>("/api/auth/login", { email, password });
  } catch (e) {
    throw new Error("邮箱或密码错误");
  }
}

export async function authBindEmail(
  token: string,
  email: string,
  password: string
): Promise<LoginResponse> {
  try {
    await api.post("/api/user/bind-email", { email, password }, token);
  } catch (e) {
    const msg = (e as { body?: { error?: string } }).body?.error ?? "绑定失败";
    throw new Error(msg);
  }
  // 绑定后重新登录获取不带 need_bind_email 的新 token
  return api.post<LoginResponse>("/api/auth/login", { email, password });
}

export async function authGetProfile(token: string): Promise<UserProfile> {
  return api.get<UserProfile>("/api/user/profile", { token });
}

export interface SwitchAccountResult {
  token: string;
  account: accounts.AccountSummary;
}

export interface RemoveAccountResult {
  remaining: accounts.AccountSummary[];
  suggested_next?: accounts.AccountSummary | null;
}

export async function authSaveToken(token: string): Promise<void> {
  authToken.save(token, currentEnvKey());
}

export function authLoadToken(): string | undefined {
  return authToken.load()?.token;
}

export function authClearToken(): void {
  authToken.clear();
}

export function authListAccounts(): accounts.AccountSummary[] {
  return accounts.list();
}

/** 登录/建档统一入口：upsert 条目并置为 current，清理旧版单账号文件，backfill 匿名 outbox */
export async function authRegisterAccount(
  token: string,
  profile: UserProfile
): Promise<accounts.AccountSummary> {
  const summary = accounts.upsert({
    user_id: profile.id,
    env: accounts.normalizedEnv(),
    token,
    nickname: profile.nickname,
    email: profile.email,
    avatar_url: profile.avatar_url,
    login_type: profile.login_type,
    last_used_at: "",
  });
  authToken.clearLegacyFiles();
  claimAnonymousReviews(summary.user_id);
  return summary;
}

export function authSwitchAccount(key: string): SwitchAccountResult {
  const { account, summary } = accounts.switch(key);
  return { token: account.token, account: summary };
}

export function authRemoveAccount(key: string): RemoveAccountResult {
  return accounts.remove(key);
}

