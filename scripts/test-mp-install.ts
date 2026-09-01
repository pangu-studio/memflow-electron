/**
 * M3.2 客户端安装集成测试：
 * 构建真实插件 tgz → 本地 HTTP 提供下载 → 创作者提交+admin 背书 →
 * 客户端 installPluginFromMarketplace（下载/验签/落盘/挂载）→ 命令可 dispatch。
 * 另验证：篡改版包被拒。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { setEnvOverride, appDataRoot } from "../electron/config";

setEnvOverride("test", "http://localhost:8080");
process.env.MEMFLOW_DEV_MODE = "1";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : (extra ?? ""));
  cond ? passed++ : failed++;
};

const BASE = "http://localhost:8080";
const pluginName = `com.mptest.install-${Date.now() % 100000}`;

async function api(method: string, url: string, token: string | null, body?: unknown) {
  const resp = await fetch(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: resp.status, data: await resp.json().catch(() => ({})) };
}

async function newUser(tag: string): Promise<string> {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  await api("POST", "/api/auth/register", null, { email, password: "test-password-123" });
  const { data } = await api("POST", "/api/auth/login", null, { email, password: "test-password-123" });
  return (data as { token: string }).token;
}

/** 构建插件目录并打 tgz；返回 { dir, tgzPath, sha256 } */
function buildPluginPkg(entryCode: string, version = "1.0.0"): { dir: string; tgz: string; sha: string } {
  const dir = path.join(os.tmpdir(), `${pluginName.replace(/\./g, "-")}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    name: pluginName,
    version,
    displayName: "安装测试插件",
    main: "./main.cjs",
    permissions: [],
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(dir, "main.cjs"), entryCode);
  const tgz = path.join(dir, "pkg.tgz");
  execFileSync("tar", ["-czf", tgz, "-C", dir, "manifest.json", "main.cjs"]);
  // sha256 语义 = 入口文件哈希（与 registry 签名载荷 entrySha256 一致）
  const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, "main.cjs"))).digest("hex");
  return { dir, tgz, sha };
}

async function main() {
  const entryCode = `exports.apply = (ctx) => { ctx.registerCommand("mp_installed_hello", () => ({ ok: true, by: ${JSON.stringify(pluginName)} })); };`;
  const pkg = buildPluginPkg(entryCode);

  // 本地 HTTP 服务提供下载
  const server = http.createServer((req, res) => {
    if (req.url === "/pkg.tgz") {
      res.writeHead(200, { "Content-Type": "application/gzip" });
      res.end(fs.readFileSync(pkg.tgz));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const pkgUrl = `http://127.0.0.1:${port}/pkg.tgz`;

  // 云端：注册 → 提交（真实 URL+sha256）→ admin 背书
  const creator = await newUser("mpi-creator");
  const envFile = fs.readFileSync(path.resolve(__dirname, "../../../memflow-cloud/.env"), "utf-8");
  const adminLogin = await api("POST", "/api/auth/login", null, {
    email: envFile.match(/^MEMFLOW_ADMIN_EMAIL=(.+)$/m)?.[1]?.trim(),
    password: envFile.match(/^MEMFLOW_ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim(),
  });
  const admin = (adminLogin.data as { token: string }).token;
  const created = await api("POST", "/api/marketplace/plugins", creator, { name: pluginName, display_name: "安装测试插件" });
  const pluginId = (created.data as { id: string }).id;
  const manifestStr = JSON.stringify({ name: pluginName, version: "1.0.0", displayName: "安装测试插件", main: "./main.cjs", permissions: [] });
  const submitted = await api("POST", `/api/marketplace/plugins/${pluginId}/versions`, creator, {
    version: "1.0.0",
    package_url: pkgUrl,
    package_name: "pkg.tgz",
    package_size: fs.statSync(pkg.tgz).size,
    sha256: pkg.sha,
    manifest: manifestStr,
  });
  check("版本提交", submitted.status === 200, submitted);
  const reviewed = await api("POST", `/api/admin/marketplace/versions/${(submitted.data as { id: string }).id}/review`, admin, { action: "approve" });
  check("admin 背书", reviewed.status === 200 && !!(reviewed.data as { signature: string }).signature);

  // 客户端安装（dispatch 经 ipc 模块）
  const { dispatch } = await import("../electron/ipc");
  const install = (await dispatch("marketplace_install", { name: pluginName })) as { plugin: string; version: string };
  check("市场安装成功（下载+验签+挂载）", install.plugin === pluginName && install.version === "1.0.0", install);
  const hello = (await dispatch("mp_installed_hello", {})) as { ok: boolean };
  check("安装后插件命令可 dispatch", hello.ok === true);
  const nav = ((await dispatch("get_contributions", {})) as { navigation: { id: string }[] }).navigation;
  check("安装后出现在统一插件列表", (await dispatch("list_plugins", {})).some((p: { name: string }) => p.name === pluginName));

  // 篡改包被拒：改入口代码 → 新包 → 重新提交 v1.0.1 → 背书 → 安装应验签失败
  const pkg2 = buildPluginPkg(entryCode, "1.0.1");
  const server2 = http.createServer((req, res) => {
    if (req.url === "/pkg.tgz") { res.writeHead(200, { "Content-Type": "application/gzip" }); res.end(fs.readFileSync(pkg2.tgz)); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((r) => server2.listen(0, "127.0.0.1", r));
  const pkgUrl2 = `http://127.0.0.1:${(server2.address() as { port: number }).port}/pkg.tgz`;
  const v2 = await api("POST", `/api/marketplace/plugins/${pluginId}/versions`, creator, {
    version: "1.0.1", package_url: pkgUrl2, package_name: "pkg.tgz",
    package_size: fs.statSync(pkg2.tgz).size, sha256: pkg2.sha,
    manifest: manifestStr.replace("1.0.0", "1.0.1"),
  });
  await api("POST", `/api/admin/marketplace/versions/${(v2.data as { id: string }).id}/review`, admin, { action: "approve" });
  // 背书后篡改包内容（入口文件追加注释，manifest/版本不变）→ 验签应拒绝
  fs.appendFileSync(path.join(pkg2.dir, "main.cjs"), "\n// tampered after signing\n");
  execFileSync("tar", ["-czf", pkg2.tgz, "-C", pkg2.dir, "manifest.json", "main.cjs"]);
  let tamperErr = "";
  try {
    await dispatch("marketplace_install", { name: pluginName });
  } catch (e) {
    tamperErr = (e as Error).message;
  }
  check("篡改包验签拒绝", tamperErr.includes("篡改") || tamperErr.includes("验签"), tamperErr);
  const stillOk = (await dispatch("mp_installed_hello", {})) as { ok: boolean };
  check("已安装 v1.0.0 未被破坏", stillOk.ok === true);

  server.close(); server2.close();
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
