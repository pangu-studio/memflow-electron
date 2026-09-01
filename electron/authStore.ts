/**
 * 认证存储类命令（token 与多账号本地持久化）。
 * 从 auth.ts 拆出：auth.ts 保持纯 REST（renderer dev 模式可直接导入抓包），
 * 本模块依赖 node fs（authToken/accounts/db），仅主进程/CLI 使用。
 */
import { currentEnvKey } from "./config";
import * as authToken from "./authToken";
import * as accounts from "./accounts";
import { claimAnonymousReviews } from "./db";
import type { UserProfile } from "./auth";

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
