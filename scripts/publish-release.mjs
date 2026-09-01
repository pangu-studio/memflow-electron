#!/usr/bin/env node
/**
 * 发版脚本（M1.4）：构建产物 → OSS 直传 → release 模块登记 → 发布。
 *
 * 用法：
 *   MEMFLOW_ADMIN_EMAIL=... MEMFLOW_ADMIN_PASSWORD=... \
 *   node scripts/publish-release.mjs --version 0.1.0 --platform darwin-aarch64 --file release/MemFlow-0.1.0-arm64.dmg [--notes "更新说明"]
 *
 * 流程（对齐管理后台手动操作）：
 *   1. GET  /api/admin/release/desktop/upload/sign?version=&kind=installer&ext=.dmg → PostObject 签名
 *   2. POST 签名 host（multipart 表单直传 OSS，public-read）
 *   3. POST /api/admin/release/desktop  登记记录（installer_url/name/size/sha256/release_notes）
 *   4. POST /api/admin/release/desktop/:id/publish  发布（进入 latest/updater 可见集）
 *
 * Electron 自动更新走 /api/release/desktop/latest（installer_url + sha256），
 * 无需填 updater_url/updater_signature（那是 Tauri 专用）。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) return args[i + 1];
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};
const VERSION = opt("version");
const PLATFORM = opt("platform", "darwin-aarch64");
const FILE = opt("file");
const NOTES = opt("notes", "");
const BASE = opt("api", "https://apis.memflow.com.cn");
const EMAIL = process.env.MEMFLOW_ADMIN_EMAIL;
const PASSWORD = process.env.MEMFLOW_ADMIN_PASSWORD;

if (!VERSION || !FILE || !EMAIL || !PASSWORD) {
  console.error(
    '用法: MEMFLOW_ADMIN_EMAIL=... MEMFLOW_ADMIN_PASSWORD=... node scripts/publish-release.mjs --version X.Y.Z --platform darwin-aarch64 --file <installer> [--notes "..."] [--api BASE]'
  );
  process.exit(1);
}
const filePath = path.resolve(FILE);
if (!fs.existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`);
  process.exit(1);
}
const ext = path.extname(filePath).toLowerCase();
const fileName = path.basename(filePath);
const data = fs.readFileSync(filePath);
const sha256 = crypto.createHash("sha256").update(data).digest("hex");

async function api(method, url, token, body) {
  const resp = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok) {
    console.error(`✖ ${method} ${url} → HTTP ${resp.status}:`, JSON.stringify(json).slice(0, 300));
    process.exit(1);
  }
  return json;
}

console.log(`[1/4] 管理员登录 ${BASE}`);
const login = await api("POST", "/api/auth/login", null, { email: EMAIL, password: PASSWORD });
const token = login.token;

console.log(`[2/4] 申请 OSS 上传签名（${fileName}, ${(data.length / 1048576).toFixed(1)} MB）`);
const sign = await api(
  "GET",
  `/api/admin/release/desktop/upload/sign?version=${encodeURIComponent(VERSION)}&kind=installer&ext=${encodeURIComponent(ext)}`,
  token
);
// OSS PostObject 直传（multipart 表单）
const form = new FormData();
form.append("key", sign.key);
form.append("policy", sign.policy);
form.append("OSSAccessKeyId", sign.oss_access_key_id);
form.append("signature", sign.signature);
if (sign.object_acl) form.append("x-oss-object-acl", sign.object_acl);
form.append("success_action_status", "200");
form.append("file", new Blob([data]), fileName);
const up = await fetch(sign.host, { method: "POST", body: form });
if (!up.ok) {
  console.error(`✖ OSS 上传失败: HTTP ${up.status}`, (await up.text()).slice(0, 300));
  process.exit(1);
}
console.log(`  上传完成: ${sign.url}`);

console.log("[3/4] 登记 release 记录");
const created = await api("POST", "/api/admin/release/desktop", token, {
  version: VERSION,
  platform: PLATFORM,
  installer_url: sign.url,
  installer_name: fileName,
  installer_size: data.length,
  sha256,
  release_notes: NOTES,
});
console.log(`  记录 ID: ${created.id ?? JSON.stringify(created).slice(0, 120)}`);
const recordId = created.id ?? created.ID;

console.log("[4/4] 发布");
await api("POST", `/api/admin/release/desktop/${recordId}/publish`, token, {});
console.log(`✅ 发布完成：${PLATFORM} ${VERSION}（sha256 ${sha256.slice(0, 12)}…）`);
console.log(`   更新检查: ${BASE}/api/release/desktop/latest`);
