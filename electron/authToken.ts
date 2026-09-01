/**
 * 单账号 token 文件的兼容层。
 * 移植自 memflow-desktop/src-tauri/src/auth_token.rs，逐函数对齐：
 * 多账号改造后唯一事实来源是 accounts.json（见 accounts.ts）；
 * 本模块保留对旧版 auth_token.json（及更早的 cli_token.json）的读取回退，
 * 供升级过渡期使用——profile 验证成功后建档，建档即删除旧文件
 * （惰性建档，老用户升级无感）。
 *
 * save/load/clear 的语义已重定向到 accounts：
 *   - load：先读 accounts 的 current 条目，再回退旧文件链
 *   - save：有 current 条目则更新其 token，否则写旧文件（建档前过渡）
 *   - clear：移除 current 条目（不再删"唯一文件"）+ 清理旧文件
 */
import fs from "node:fs";
import nodePath from "node:path";
import { appDataRoot } from "./config";
import * as accounts from "./accounts";

/** 与 Rust StoredToken 字段一致（snake_case，JSON 契约） */
export interface StoredToken {
  token: string;
  /** 登录时的 api_env（prod/staging/test/custom），用于环境错配提示 */
  env?: string | null;
}

function tokenPath(): string {
  return nodePath.join(appDataRoot(), "auth_token.json");
}

/** 旧版 CLI 私有 token 文件（一次性迁移来源） */
function legacyCliTokenPath(): string {
  return nodePath.join(appDataRoot(), "cli_token.json");
}

/** 有 current 条目则更新其 token；无（尚未建档）则写旧版单账号文件过渡 */
export function save(token: string, env?: string | null): void {
  if (accounts.current()) {
    return accounts.updateCurrentToken(token);
  }
  saveLegacy(token, env ?? null);
}

function saveLegacy(token: string, env: string | null): void {
  const p = tokenPath();
  fs.mkdirSync(nodePath.dirname(p), { recursive: true });
  const body = JSON.stringify({ token, env } satisfies StoredToken);
  fs.writeFileSync(p, body);
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    // 非 Unix 平台无权限概念，忽略错误（与 Rust #[cfg(unix)] 一致）
  }
}

export function load(): StoredToken | null {
  // 多账号：current 条目优先
  const a = accounts.current();
  if (a) {
    return { token: a.token, env: a.env };
  }
  // 回退：旧版单账号文件
  try {
    const t = JSON.parse(fs.readFileSync(tokenPath(), "utf-8")) as StoredToken;
    if (t && typeof t.token === "string") {
      return { token: t.token, env: t.env ?? null };
    }
  } catch {
    // 不存在或损坏则继续回退
  }
  // 一次性迁移：旧版 CLI 私有的 cli_token.json
  let legacy: string;
  try {
    legacy = fs.readFileSync(legacyCliTokenPath(), "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(legacy);
  } catch {
    return null;
  }
  const token = (parsed as { token?: unknown })?.token;
  if (typeof token !== "string") return null;
  try {
    saveLegacy(token, null);
  } catch {
    // 与 Rust 的 let _ = 一致：迁移写盘失败不阻断
  }
  try {
    fs.rmSync(legacyCliTokenPath(), { force: true });
  } catch {
    // 忽略
  }
  return { token, env: null };
}

/** 移除 current 账号条目 + 清理旧文件（登出的持久化部分） */
export function clear(): void {
  const a = accounts.current();
  if (a) {
    accounts.remove(accounts.key(a.env, a.user_id));
  }
  clearLegacyFiles();
}

/** 建档完成后清理旧版文件 */
export function clearLegacyFiles(): void {
  try {
    fs.rmSync(tokenPath(), { force: true });
  } catch {
    // 忽略
  }
  try {
    fs.rmSync(legacyCliTokenPath(), { force: true });
  } catch {
    // 忽略
  }
}
