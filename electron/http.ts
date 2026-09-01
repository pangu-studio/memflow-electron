/**
 * 云端 REST 小助手：封装 base 解析、Authorization 头与错误处理。
 * 语义对齐 Rust 侧 reqwest 调用：非 2xx 时抛错（调用方按需捕获解析 409 等）。
 */
import { resolveApiBase } from "./config";

// 进程级 base 覆盖（renderer dev 直连模式由 invoke 桥设置）
let baseOverride: string | null = null;
export function setApiBaseOverride(base: string | null): void {
  baseOverride = base;
}

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string
  ) {
    super(message ?? `HTTP ${status}`);
  }
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function request<T>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; params?: Record<string, string | undefined> }
): Promise<T> {
  const base = baseOverride ?? resolveApiBase();
  let url = `${base}${path}`;
  if (opts.params) {
    const qs = Object.entries(opts.params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  const resp = await fetch(url, {
    method,
    headers: headers(opts.token),
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await resp.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!resp.ok) throw new ApiHttpError(resp.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string, opts: { token?: string; params?: Record<string, string | undefined> } = {}) =>
    request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, token?: string) =>
    request<T>("POST", path, { body, token }),
  put: <T>(path: string, body?: unknown, token?: string) =>
    request<T>("PUT", path, { body, token }),
  delete: <T>(path: string, token?: string) => request<T>("DELETE", path, { token }),
};
