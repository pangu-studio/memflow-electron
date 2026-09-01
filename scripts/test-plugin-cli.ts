/**
 * M3.3 全链路集成测试：脚手架 submit（真实 OSS 直传）→ admin 背书 →
 * 客户端一键安装（从 OSS 下载）→ 命令可用。验证开发者闭环。
 */
import fs from "node:fs";
import path from "node:path";
import { setEnvOverride } from "../electron/config";

setEnvOverride("test", "http://localhost:8080");
process.env.MEMFLOW_DEV_MODE = "1";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : (extra ?? ""));
  cond ? passed++ : failed++;
};

const BASE = "http://localhost:8080";

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

async function main() {
  // 1. 脚手架 init → pack（与示例插件独立，验证骨架可用）
  const { initPlugin, packPlugin, submitPlugin } = await import("../packages/plugin-cli/src/index");
  const workDir = `/private/tmp/memflow-cli-test/plugin-src`;
  fs.rmSync("/private/tmp/memflow-cli-test", { recursive: true, force: true });
  const init = initPlugin(workDir, { name: `com.cli.e2e-${Date.now() % 100000}`, displayName: "CLI E2E", version: "1.0.0" });
  check("脚手架 init 生成骨架", init.files.length === 3);
  const packed = packPlugin(workDir);
  check("脚手架 pack 产出 tgz", fs.existsSync(packed.tgz));

  // 2. submit（真实 OSS 直传）
  const creator = await newUser("cli-e2e");
  let submitErr = "";
  let submitted: { plugin: string; version: string; status: string } | null = null;
  try {
    submitted = await submitPlugin(workDir, { token: creator, api: BASE });
  } catch (e) {
    submitErr = (e as Error).message;
  }
  const ossUnreachable = /OSS 上传失败|fetch failed|ECONNRESET|Connect Timeout|代理 CONNECT/.test(submitErr);
  if (ossUnreachable) {
    console.log(`  ⏭️  OSS 不可达（${submitErr.slice(0, 80)}）——本环境网络限制，CI/直连网络将全链路执行`);
    process.exit(2);
  }
  check("脚手架 submit（注册+OSS 直传+提交）", submitted?.status === "pending", submitErr || submitted);
  const pluginName = submitted!.plugin;

  // 3. admin 背书
  const envFile = fs.readFileSync(path.resolve(__dirname, "../../../memflow-cloud/.env"), "utf-8");
  const adminLogin = await api("POST", "/api/auth/login", null, {
    email: envFile.match(/^MEMFLOW_ADMIN_EMAIL=(.+)$/m)?.[1]?.trim(),
    password: envFile.match(/^MEMFLOW_ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim(),
  });
  const admin = (adminLogin.data as { token: string }).token;
  const pending = await api("GET", "/api/admin/marketplace/versions?status=pending", admin);
  const mine = (pending.data as { items: { id: string; manifest?: string }[] }).items.find((v) =>
    (v.manifest ?? "").includes(pluginName)
  );
  check("admin 待审列表可见提交", !!mine);
  const review = await api("POST", `/api/admin/marketplace/versions/${mine!.id}/review`, admin, { action: "approve" });
  check("admin 背书", review.status === 200 && !!(review.data as { signature: string }).signature);

  // 4. 客户端一键安装（从 OSS 下载 → 验签 → 挂载）
  const { dispatch } = await import("../electron/ipc");
  const install = (await dispatch("marketplace_install", { name: pluginName })) as { plugin: string; version: string };
  check("客户端从 OSS 安装成功", install.plugin === pluginName && install.version === "1.0.0", install);
  const greet = (await dispatch("hello_greet", {})) as { greeting: string };
  check("插件命令可用（脚手架骨架命令）", typeof greet.greeting === "string", greet);

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
