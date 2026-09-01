/**
 * 签名框架单测：ed25519 生成/签名/验签/篡改拒绝/可信公钥列表。
 */
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canonicalStringify,
  checkPluginSignature,
  sha256File,
  signPayload,
  verifyPayload,
  type SignaturePayload,
} from "../electron/signature";

process.env.MEMFLOW_DATA_DIR = "/private/tmp/memflow-sig-test";

function genKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyDerB64: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

function fixturePlugin(dir: string, manifest: Record<string, unknown>, entryCode: string): string {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, "main.cjs");
  fs.writeFileSync(entry, entryCode);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return entry;
}

const baseManifest = { name: "com.example.hello", version: "1.0.0", displayName: "Hello", main: "./main.cjs" };

describe("插件签名", () => {
  it("canonicalStringify 键排序稳定", () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }));
  });

  it("sign/verify 往返通过，篡改拒绝", () => {
    const keys = genKeys();
    const payload: SignaturePayload = { name: "com.x", version: "1.0.0", entrySha256: "abc" };
    const sig = signPayload(payload, keys.privateKeyPem);
    expect(verifyPayload(payload, sig, keys.publicKeyPem)).toBe(true);
    expect(verifyPayload({ ...payload, version: "2.0.0" }, sig, keys.publicKeyPem)).toBe(false);
    expect(verifyPayload(payload, sig, genKeys().publicKeyPem)).toBe(false);
  });

  it("可信公钥列表验签通过；未列入的密钥拒绝", () => {
    const keys = genKeys();
    const other = genKeys();
    fs.mkdirSync(process.env.MEMFLOW_DATA_DIR!, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.MEMFLOW_DATA_DIR!, "trusted_plugin_keys.json"),
      JSON.stringify({ keys: [keys.publicKeyDerB64] })
    );
    const dir = path.join(os.tmpdir(), "sig-plugin-ok");
    const entry = fixturePlugin(dir, baseManifest, "module.exports={apply(){}}");
    const payload = { name: baseManifest.name, version: baseManifest.version, main: "./main.cjs", entrySha256: sha256File(entry) };
    const sig = signPayload(payload as SignaturePayload, keys.privateKeyPem);
    const r1 = checkPluginSignature(dir, { ...baseManifest, signature: sig }, entry, { isPackaged: true });
    expect(r1.ok).toBe(true);
    const sigOther = signPayload(payload as SignaturePayload, other.privateKeyPem);
    const r2 = checkPluginSignature(dir, { ...baseManifest, signature: sigOther }, entry, { isPackaged: true });
    expect(r2.ok).toBe(false);
  });

  it("未签名：dev 放行+标记，packaged 拒绝", () => {
    const dir = path.join(os.tmpdir(), "sig-plugin-unsigned");
    const entry = fixturePlugin(dir, baseManifest, "module.exports={apply(){}}");
    const dev = checkPluginSignature(dir, baseManifest, entry, { isPackaged: false });
    expect(dev.ok).toBe(true);
    expect(dev.devAllowUnsigned).toBe(true);
    const prod = checkPluginSignature(dir, baseManifest, entry, { isPackaged: true });
    expect(prod.ok).toBe(false);
  });

  it("入口文件被篡改 → 验签失败", () => {
    const keys = genKeys();
    fs.mkdirSync(process.env.MEMFLOW_DATA_DIR!, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.MEMFLOW_DATA_DIR!, "trusted_plugin_keys.json"),
      JSON.stringify({ keys: [keys.publicKeyDerB64] })
    );
    const dir = path.join(os.tmpdir(), "sig-plugin-tamper");
    const entry = fixturePlugin(dir, baseManifest, "module.exports={apply(){}}");
    const payload = { name: baseManifest.name, version: baseManifest.version, main: "./main.cjs", entrySha256: sha256File(entry) };
    const sig = signPayload(payload as SignaturePayload, keys.privateKeyPem);
    fs.appendFileSync(entry, "\n// 篡改");
    const r = checkPluginSignature(dir, { ...baseManifest, signature: sig }, entry, { isPackaged: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("篡改");
  });
});
