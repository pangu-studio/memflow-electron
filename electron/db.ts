/**
 * 本地 SQLite。驱动自适应：
 * - Electron 主进程：better-sqlite3（原生性能，随 Electron ABI 重建）
 * - 纯 Node（memflow-cli / 测试）：node:sqlite（Node ≥22.5 内置，零原生依赖）
 * 表结构与迁移（user_version 1→2）和 Rust 版（db.rs）完全一致，数据文件可互换。
 */
import path from "node:path";
import fs from "node:fs";
import { appDataRoot } from "./config";
import type { ReviewEvent } from "@nssai/scheduler";

interface Stmt {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number };
}
interface Driver {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
}

/** node:sqlite 适配层（语句 API 对齐 better-sqlite3 子集） */
function nodeSqliteDriver(file: string): Driver {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(file);
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        get: (...p) => stmt.get(...(p as [])),
        all: (...p) => stmt.all(...(p as [])) as unknown[],
        run: (...p) => {
          const r = stmt.run(...(p as []));
          return { changes: Number(r.changes) };
        },
      };
    },
  };
}

function loadDriver(file: string): Driver {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Database = require("better-sqlite3") as any;
    const db = new Database(file);
    return {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => db.prepare(sql),
    };
  } catch {
    // ABI 不匹配 / 纯 Node 环境：回退内置驱动
    return nodeSqliteDriver(file);
  }
}

let db: Driver | null = null;

export function initDb(): Driver {
  if (db) return db;
  const dir = appDataRoot();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "memflow.db");
  const d = loadDriver(file);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec("PRAGMA foreign_keys = ON");
  migrate(d);
  db = d;
  return d;
}

function pragmaUserVersion(d: Driver): number {
  const row = d.prepare("PRAGMA user_version").get() as Record<string, number>;
  return Object.values(row)[0];
}

function migrate(d: Driver): void {
  const version = pragmaUserVersion(d);
  if (version < 1) {
    d.exec(`CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    d.exec(`CREATE TABLE IF NOT EXISTS pending_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    d.exec("PRAGMA user_version = 1");
  }
  if (version < 2) {
    d.exec(`ALTER TABLE pending_reviews ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
    d.exec(`CREATE INDEX IF NOT EXISTS idx_pending_reviews_user ON pending_reviews(user_id)`);
    d.exec(`DELETE FROM sync_meta WHERE key = 'quota_cache'`);
    d.exec("PRAGMA user_version = 2");
  }
}

// ---- sync_meta KV ----

export function getSyncMeta(key: string): string | undefined {
  const row = initDb().prepare("SELECT value FROM sync_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSyncMeta(key: string, value: string): void {
  initDb()
    .prepare(
      "INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

// ---- pending_reviews outbox ----

export function enqueueReview(event: ReviewEvent, userId: string): void {
  initDb()
    .prepare(
      "INSERT OR IGNORE INTO pending_reviews (review_id, payload, user_id) VALUES (?, ?, ?)"
    )
    .run(event.review_id, JSON.stringify(event), userId);
}

/** FIFO 读取指定账号待提交事件（'' 匿名桶一并参与） */
export function listPendingReviews(userId: string): ReviewEvent[] {
  const rows = initDb()
    .prepare(
      "SELECT payload FROM pending_reviews WHERE user_id = ? OR user_id = '' ORDER BY id ASC"
    )
    .all(userId) as { payload: string }[];
  return rows.map((r) => JSON.parse(r.payload) as ReviewEvent);
}

export function dequeueReview(reviewId: string): void {
  initDb().prepare("DELETE FROM pending_reviews WHERE review_id = ?").run(reviewId);
}

export function countPendingReviews(userId: string): number {
  const row = initDb()
    .prepare("SELECT COUNT(*) AS n FROM pending_reviews WHERE user_id = ? OR user_id = ''")
    .get(userId) as { n: number };
  return row.n;
}

/** 建档后 backfill：'' 匿名桶归属当前账号 */
export function claimAnonymousReviews(userId: string): number {
  return initDb()
    .prepare("UPDATE pending_reviews SET user_id = ? WHERE user_id = ''")
    .run(userId).changes;
}

export function listPendingUserIds(): string[] {
  const rows = initDb()
    .prepare("SELECT DISTINCT user_id FROM pending_reviews")
    .all() as { user_id: string }[];
  return rows.map((r) => r.user_id);
}
