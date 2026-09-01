/**
 * 多账号存储（唯一事实来源）：accounts.json（0600，tmp+rename 原子写）。
 * 移植自 memflow-desktop/src-tauri/src/accounts.rs，逐函数对齐：
 *   - 桌面端支持多账号并存快速切换——所有已登录账号的 token 都保留在本地，
 *     current 指针决定当前生效账号；GUI 与 CLI 共享同一文件。
 *   - 条目 key = "{env}:{user_id}"：同一用户在不同 api_env 下持不同 token，视为两个条目。
 *   - JSON 结构、文件路径（appDataRoot()）、权限语义与 Rust 版一致，数据文件可互换。
 * 迁移：旧版单账号 auth_token.json（及更早的 cli_token.json）由 authToken.ts
 * 兼容层继续读取；建档后删除旧文件（惰性建档，老用户升级无感）。
 */
import fs from "node:fs";
import nodePath from "node:path";
import { appDataRoot, currentEnvKey, compileTimeDefault, PROD_API_BASE } from "./config";

/** 与 Rust StoredAccount 字段一致（snake_case，JSON 契约） */
export interface StoredAccount {
  user_id: string;
  /** 签发时归一化的 env key（见 normalizedEnv） */
  env: string;
  token: string;
  // ---- profile 快照：切换菜单即时展示用，切换成功后由 profile 接口刷新回写 ----
  nickname?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  login_type?: string;
  /** RFC3339；logout 后自动切换选"最近使用"的账号 */
  last_used_at: string;
}

interface AccountsFile {
  version: number;
  /** 当前账号条目 key；null/undefined = 未登录 */
  current?: string | null;
  accounts: StoredAccount[];
}

function defaultFile(): AccountsFile {
  return { version: 1, current: null, accounts: [] };
}

/** 前端展示用（不含 token） */
export interface AccountSummary {
  key: string;
  user_id: string;
  env: string;
  nickname: string | null;
  email: string | null;
  avatar_url: string | null;
  login_type: string;
  last_used_at: string;
  is_current: boolean;
  /** 条目 env 是否为当前生效环境（异 env 条目 UI 灰显，点击提示而非切换） */
  is_current_env: boolean;
}

export interface RemoveResult {
  remaining: AccountSummary[];
  /** 删除的是 current 时，建议切换目标（剩余中 last_used_at 最新者）；不自动切换 */
  suggested_next?: AccountSummary | null;
}

export function path(): string {
  return nodePath.join(appDataRoot(), "accounts.json");
}

export function key(env: string, userId: string): string {
  return `${env}:${userId}`;
}

/**
 * 归一化当前 env key：无覆盖时回退编译期默认（release=prod、dev=test），
 * 保证同一环境始终映射到同一 key，accounts 条目可复用。
 */
export function normalizedEnv(): string {
  return (
    currentEnvKey() ??
    (compileTimeDefault() === PROD_API_BASE ? "prod" : "test")
  );
}

function nowRfc3339(): string {
  return new Date().toISOString();
}

/** yyyyMMddHHmmss（UTC；文件名不用 RFC3339：冒号在 Windows 文件名中非法） */
function timestampForFilename(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

export function loadFile(): AccountsFile {
  const p = path();
  let raw: string;
  try {
    raw = fs.readFileSync(p, "utf-8");
  } catch {
    return defaultFile();
  }
  try {
    const f = JSON.parse(raw) as AccountsFile;
    f.version = 1;
    return f;
  } catch {
    // JSON 损坏：备份后从头开始，避免全部账号无声丢失
    const backup = nodePath.join(
      nodePath.dirname(p),
      `accounts.json.corrupt-${timestampForFilename()}`
    );
    try {
      fs.renameSync(p, backup);
    } catch {
      // 备份失败也继续重置，与 Rust 版一致（忽略错误）
    }
    return defaultFile();
  }
}

/** tmp+rename 原子替换，权限 0600 */
function saveFile(file: AccountsFile): void {
  const p = path();
  fs.mkdirSync(nodePath.dirname(p), { recursive: true });
  const body = JSON.stringify(file, null, 2);
  const tmp = nodePath.join(nodePath.dirname(p), "accounts.json.tmp");
  fs.writeFileSync(tmp, body);
  // Windows 上 rename 不允许覆盖已存在的目标，先删再 rename 兜底
  try {
    fs.renameSync(tmp, p);
  } catch (e) {
    try {
      fs.rmSync(p, { force: true });
    } catch {
      // 忽略
    }
    fs.renameSync(tmp, p);
  }
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    // 非 Unix 平台无权限概念，忽略错误（与 Rust #[cfg(unix)] 一致）
  }
}

function summary(file: AccountsFile, a: StoredAccount): AccountSummary {
  const k = key(a.env, a.user_id);
  return {
    key: k,
    user_id: a.user_id,
    env: a.env,
    nickname: a.nickname ?? null,
    email: a.email ?? null,
    avatar_url: a.avatar_url ?? null,
    login_type: a.login_type ?? "",
    last_used_at: a.last_used_at,
    is_current: file.current === k,
    is_current_env: a.env === normalizedEnv(),
  };
}

export function list(): AccountSummary[] {
  const file = loadFile();
  return file.accounts.map((a) => summary(file, a));
}

export function current(): StoredAccount | null {
  const file = loadFile();
  const cur = file.current;
  if (!cur) return null;
  return file.accounts.find((a) => key(a.env, a.user_id) === cur) ?? null;
}

/** 登录/建档统一入口：同 key 覆盖 token+快照，刷新 last_used_at 并置为 current。 */
export function upsert(account: StoredAccount): AccountSummary {
  const file = loadFile();
  const k = key(account.env, account.user_id);
  const next: StoredAccount = { ...account, last_used_at: nowRfc3339() };
  const idx = file.accounts.findIndex((a) => key(a.env, a.user_id) === k);
  if (idx >= 0) {
    file.accounts[idx] = next;
  } else {
    file.accounts.push(next);
  }
  file.current = k;
  saveFile(file);
  return summary(file, next);
}

/** 切换 current 指针（不做网络校验，校验在前端流程中） */
export function switchAccount(
  targetKey: string
): { account: StoredAccount; summary: AccountSummary } {
  const file = loadFile();
  const idx = file.accounts.findIndex(
    (a) => key(a.env, a.user_id) === targetKey
  );
  if (idx < 0) throw new Error("账号不存在或已被移除");
  file.accounts[idx].last_used_at = nowRfc3339();
  file.current = targetKey;
  saveFile(file);
  const account = file.accounts[idx];
  return { account, summary: summary(file, account) };
}

/** 更新 current 条目的 token（bind_email 换新 token 等场景）；无 current 抛错 */
export function updateCurrentToken(token: string): void {
  const file = loadFile();
  const cur = file.current;
  if (!cur) throw new Error("no current account");
  const existing = file.accounts.find((a) => key(a.env, a.user_id) === cur);
  if (!existing) throw new Error("current account missing");
  existing.token = token;
  saveFile(file);
}

export function remove(targetKey: string): RemoveResult {
  const file = loadFile();
  const wasCurrent = file.current === targetKey;
  file.accounts = file.accounts.filter(
    (a) => key(a.env, a.user_id) !== targetKey
  );
  if (wasCurrent) {
    file.current = null;
  }
  saveFile(file);
  // suggested_next：剩余中 last_used_at 最新者（字符串比较，与 Rust cmp 一致）
  let latest: StoredAccount | null = null;
  for (const a of file.accounts) {
    if (!latest || a.last_used_at > latest.last_used_at) latest = a;
  }
  return {
    remaining: file.accounts.map((a) => summary(file, a)),
    suggested_next: wasCurrent && latest ? summary(file, latest) : null,
  };
}

export function count(): number {
  return loadFile().accounts.length;
}

// `switch` 是保留字，不能作函数声明名；以别名导出保持与 Rust `pub fn switch` 同名
export { switchAccount as switch };
