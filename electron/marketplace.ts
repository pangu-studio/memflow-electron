/**
 * 插件市场客户端（M3.2）：浏览 + 一键安装。
 *
 * 安装流程（installPluginFromMarketplace）：
 *   1. GET /api/marketplace/install/:name → 版本（包地址 + registry 签名 + sha256）
 *   2. GET /api/marketplace/pubkey → registry 公钥加入本地可信列表（trusted_plugin_keys.json）
 *   3. 下载 tgz → 解压到临时目录 → 验签（manifest 规范化子集 + 入口 sha256，
 *      与 electron/signature.ts 同一套语义）
 *   4. 通过 → 移入 plugins/<包名末段>/ → 挂载加载；POST /plugins/:id/install 计数
 *   失败 → 清理临时目录，不落地。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import * as tar from "tar";
import { api } from "./http";
import { listMarketplacePlugins, getInstallTarget, type MarketplacePluginItem, type MarketplaceInstallTarget } from "./marketplaceApi";
import { appDataRoot } from "./config";
import {
  canonicalStringify,
  loadTrustedKeys,
  sha256File,
  type SignaturePayload,
} from "./signature";
import { loadExternalPlugins } from "./externalPlugins";
import { downloadBuffer } from "../packages/plugin-cli/src/net";
import type { RootRuntime } from "./core/pluginApi";

/** 把 registry 公钥加入本地可信列表（幂等）；返回是否新增 */
export async function trustRegistryKey(): Promise<boolean> {
  const { key } = await api.get<{ key: string }>("/api/marketplace/pubkey");
  const trusted = loadTrustedKeys();
  if (trusted.includes(key)) return false;
  fs.mkdirSync(appDataRoot(), { recursive: true });
  fs.writeFileSync(
    path.join(appDataRoot(), "trusted_plugin_keys.json"),
    JSON.stringify({ keys: [...trusted, key] }, null, 2)
  );
  return true;
}

export interface InstallResult {
  plugin: string;
  version: string;
  commands: string[];
  trustedKeyAdded: boolean;
}

/** 从市场安装插件（下载 → 验签 → 落盘 → 挂载） */
export async function installPluginFromMarketplace(
  rt: RootRuntime,
  name: string
): Promise<InstallResult> {
  const target = await getInstallTarget(name);
  if (!target?.package_url) throw new Error("安装目标缺少包地址");
  if (!target.signature) throw new Error("安装目标缺少签名");

  const trustedKeyAdded = await trustRegistryKey();

  // 下载
  const buf = await downloadBuffer(target.package_url);
  // sha256 语义 = 入口文件哈希（签名载荷的 entrySha256），随验签核对；包传输完整性由 TLS + 签名链保障

  // 解压到临时目录
  const tmp = path.join(os.tmpdir(), `memflow-plugin-${Date.now()}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const tmpTgz = path.join(tmp, "package.tgz");
  fs.writeFileSync(tmpTgz, buf);
  try {
    await tar.x({ file: tmpTgz, cwd: tmp });
    fs.rmSync(tmpTgz);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`解压插件包失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 验签
  try {
    const rawManifest = JSON.parse(fs.readFileSync(path.join(tmp, "manifest.json"), "utf-8")) as Record<string, unknown>;
    const mainRel = typeof rawManifest.main === "string" ? rawManifest.main : "./main.cjs";
    const entryFile = path.resolve(tmp, mainRel);
    const payload: SignaturePayload = {
      name: rawManifest.name as string,
      version: rawManifest.version as string,
      main: mainRel,
      renderer: rawManifest.renderer as string | undefined,
      entrySha256: sha256File(entryFile),
    };
    // 与云端签名载荷一致性核对（name/version/main 必须匹配市场登记）
    if (payload.name !== name) throw new Error(`包内 manifest 名称 ${payload.name} 与市场 ${name} 不一致`);
    if (payload.version !== target.version) throw new Error(`包内版本 ${payload.version} 与市场 ${target.version} 不一致`);
    // 用可信公钥列表验签
    const signed = Buffer.from(target.signature, "base64");
    let verified = false;
    for (const derB64 of loadTrustedKeys()) {
      try {
        const pub = crypto.createPublicKey({ key: Buffer.from(derB64, "base64"), format: "der", type: "spki" });
        if (crypto.verify(null, Buffer.from(canonicalStringify(payload as unknown as Record<string, unknown>)), pub, signed)) {
          verified = true;
          break;
        }
      } catch {
        // 跳过非法公钥
      }
    }
    if (!verified) {
      throw new Error("插件签名校验失败（registry 公钥不受信或包被篡改）");
    }

    // 落盘：plugins/<name 末段>/
    const destDir = path.join(appDataRoot(), "plugins", name.split(".").pop() ?? name);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.renameSync(tmp, destDir);

    // 挂载
    const report = await loadExternalPlugins(rt);
    if (!report.loaded.includes(payload.name as string)) {
      throw new Error(`安装后加载失败: ${JSON.stringify(report.errors)}`);
    }
    // 安装计数（fire-and-forget）
    void api.post(`/api/marketplace/plugins/${target.plugin_id}/install`).catch(() => {});
    return {
      plugin: payload.name as string,
      version: payload.version as string,
      commands: report.loaded,
      trustedKeyAdded,
    };
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

export type { MarketplacePluginItem, MarketplaceInstallTarget } from "./marketplaceApi";
