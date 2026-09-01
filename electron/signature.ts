/**
 * 插件包签名（D11：ed25519 + 可信公钥列表）。
 *
 * 签名对象 = manifest 的规范化子集（name/version/main/renderer）+ 入口文件
 * 的 sha256；manifest.json 中的 `signature` 字段（base64）覆盖之。
 * 可信公钥来自数据目录 trusted_plugin_keys.json（公钥管理命令留 M3.2）。
 *
 * 信任策略：
 * - 有签名且验签通过 → 加载
 * - 无签名：开发模式（非打包）放行并 console.warn；打包模式拒绝
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appDataRoot } from "./config";

export interface SignaturePayload {
  name: string;
  version: string;
  main?: string;
  renderer?: string;
  /** 入口文件（main 指向的文件）内容的 sha256 */
  entrySha256: string;
}

/** 规范化序列化（键排序，保证签名/验签两端字节一致） */
export function canonicalStringify(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v !== undefined) sorted[key] = v;
  }
  return JSON.stringify(sorted);
}

export function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function signPayload(payload: SignaturePayload, privateKeyPem: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return crypto.sign(null, Buffer.from(canonicalStringify(payload as unknown as Record<string, unknown>)), key).toString("base64");
}

export function verifyPayload(payload: SignaturePayload, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(
      null,
      Buffer.from(canonicalStringify(payload as unknown as Record<string, unknown>)),
      key,
      Buffer.from(signatureB64, "base64")
    );
  } catch {
    return false;
  }
}

function trustedKeysPath(): string {
  return path.join(appDataRoot(), "trusted_plugin_keys.json");
}

/** 可信公钥列表（base64 ed25519 SPKI DER） */
export function loadTrustedKeys(): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(trustedKeysPath(), "utf-8")) as { keys?: string[] };
    return Array.isArray(raw.keys) ? raw.keys.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function verifyWithTrustedKeys(payload: SignaturePayload, signatureB64: string): boolean {
  for (const derB64 of loadTrustedKeys()) {
    try {
      const key = crypto.createPublicKey({ key: Buffer.from(derB64, "base64"), format: "der", type: "spki" });
      if (
        crypto.verify(
          null,
          Buffer.from(canonicalStringify(payload as unknown as Record<string, unknown>)),
          key,
          Buffer.from(signatureB64, "base64")
        )
      ) {
        return true;
      }
    } catch {
      // 非法公钥跳过
    }
  }
  return false;
}

export interface SignatureCheckResult {
  ok: boolean;
  reason?: string;
  /** 开发模式放行未签名插件 */
  devAllowUnsigned: boolean;
}

/**
 * 校验插件目录的签名。
 * @param pluginDir 插件目录（含 manifest.json 与入口文件）
 * @param manifest 已解析的 manifest 原始对象（含可选 signature 字段）
 * @param entryFile 入口文件绝对路径
 */
export function checkPluginSignature(
  pluginDir: string,
  manifest: Record<string, unknown>,
  entryFile: string,
  opts: { isPackaged: boolean }
): SignatureCheckResult {
  const signature = typeof manifest.signature === "string" ? manifest.signature : undefined;
  const payload: SignaturePayload = {
    name: manifest.name as string,
    version: manifest.version as string,
    main: manifest.main as string | undefined,
    renderer: manifest.renderer as string | undefined,
    entrySha256: sha256File(entryFile),
  };
  if (!signature) {
    if (opts.isPackaged) {
      return { ok: false, reason: "未签名插件在发布版中被拒绝", devAllowUnsigned: false };
    }
    return { ok: true, reason: "开发模式放行未签名插件", devAllowUnsigned: true };
  }
  if (verifyWithTrustedKeys(payload, signature)) {
    return { ok: true, devAllowUnsigned: false };
  }
  return { ok: false, reason: "签名校验失败（公钥不受信或内容被篡改）", devAllowUnsigned: false };
}
