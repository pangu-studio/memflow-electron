/**
 * M3.2 marketplace 后端集成测试（真实本地后端 :8080）：
 * 创作者注册插件 → 提交版本 → admin 审核 approve（registry ed25519 背书签名）
 * → 公开列表/详情/安装目标 → 客户端可验签。
 */
import fs from "node:fs";

const BASE = "http://localhost:8080";
let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`, cond ? "" : (extra ?? ""));
  cond ? passed++ : failed++;
};

async function api(method: string, url: string, token: string | null, body?: unknown) {
  const resp = await fetch(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data };
}

async function newUser(tag: string): Promise<string> {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  await api("POST", "/api/auth/register", null, { email, password: "test-password-123" });
  const { data } = await api("POST", "/api/auth/login", null, { email, password: "test-password-123" });
  return (data as { token: string }).token;
}

async function main() {
  const creator = await newUser("mp-creator");
  const envFile = fs.readFileSync(require("path").resolve(__dirname, "../../../memflow-cloud/.env"), "utf-8");
  const adminEmail = envFile.match(/^MEMFLOW_ADMIN_EMAIL=(.+)$/m)?.[1]?.trim();
  const adminPassword = envFile.match(/^MEMFLOW_ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim();
  const expectedPub = envFile.match(/^MARKETPLACE_SIGNING_KEY_PRIV=(.+)$/m);
  const adminLogin = await api("POST", "/api/auth/login", null, { email: adminEmail, password: adminPassword });
  const admin = (adminLogin.data as { token: string }).token;

  const pluginName = `com.example.mp-${Date.now() % 100000}`;

  // 1. 注册插件
  const created = await api("POST", "/api/marketplace/plugins", creator, {
    name: pluginName,
    display_name: "MP 测试插件",
    description: "marketplace 集成测试",
  });
  check("创作者注册插件", created.status === 200 && !!(created.data as { id: string }).id, created);
  const pluginId = (created.data as { id: string }).id;

  // 2. 重名他人占用 → 409
  const other = await newUser("mp-other");
  const conflict = await api("POST", "/api/marketplace/plugins", other, { name: pluginName, display_name: "抢注" });
  check("他人抢注同名 → 409", conflict.status === 409);

  // 3. 上传签名端点（不真传 OSS，仅验证签名可用）
  const sign = await api("GET", `/api/marketplace/plugins/${pluginId}/upload/sign?version=1.0.0&ext=.tgz`, creator);
  const signData = sign.data as { url?: string; host?: string };
  check("OSS 直传签名端点", sign.status === 200 && !!(signData.url ?? signData.host), JSON.stringify(sign.data).slice(0, 80));
  const badExt = await api("GET", `/api/marketplace/plugins/${pluginId}/upload/sign?version=1.0.0&ext=.exe`, creator);
  check("非 .tgz 被拒", badExt.status === 400);

  // 4. 提交版本（manifest + 伪包 URL）
  const manifest = { name: pluginName, version: "1.0.0", displayName: "MP 测试插件", main: "./main.cjs" };
  const submitted = await api("POST", `/api/marketplace/plugins/${pluginId}/versions`, creator, {
    version: "1.0.0",
    package_url: `https://example.invalid/${pluginName}.tgz`,
    package_name: "plugin.tgz",
    package_size: 1024,
    sha256: "deadbeef".repeat(8),
    signature: "", // approve 时由 registry 签名
    manifest: JSON.stringify(manifest),
  });
  check("提交版本 → pending", submitted.status === 200 && (submitted.data as { status: string }).status === "pending", submitted);
  const versionId = (submitted.data as { id: string }).id;

  // 5. 审核前公开列表不可见
  const before = await api("GET", `/api/marketplace/plugins?keyword=${encodeURIComponent(pluginName)}`, null);
  check("审核前公开列表不可见", (before.data as { items: unknown[] }).items.length === 0);

  // 6. admin 审核 approve → 返回 registry 签名
  const review = await api("POST", `/api/admin/marketplace/versions/${versionId}/review`, admin, { action: "approve", comment: "ok" });
  check("admin approve → approved", review.status === 200 && (review.data as { status: string }).status === "approved", review);
  const signature = (review.data as { signature: string }).signature;
  check("registry 背书签名生成", typeof signature === "string" && signature.length > 40);

  // 7. 公开可见 + 安装目标 + 公钥
  const after = await api("GET", `/api/marketplace/plugins?keyword=${encodeURIComponent(pluginName)}`, null);
  const item = (after.data as { items: { id: string; latest_version?: string }[] }).items.find((i) => i.id === pluginId);
  check("审核后公开列表可见", !!item && item.latest_version === "1.0.0");
  const detail = await api("GET", `/api/marketplace/plugins/${pluginId}`, null);
  check("详情含 approved 版本+签名", (detail.data as { versions: { signature?: string }[] }).versions?.[0]?.signature === signature);
  const target = await api("GET", `/api/marketplace/install/${pluginName}`, null);
  check("安装目标返回签名/包地址", (target.data as { signature?: string }).signature === signature && !!(target.data as { package_url?: string }).package_url);
  const pub = await api("GET", `/api/marketplace/pubkey`, null);
  check("公钥端点（客户端验签用）", typeof (pub.data as { key?: string }).key === "string" && (pub.data as { key: string }).key.length > 40);

  // 8. ed25519 验签端到端：用私钥验 registry 签名（载荷与客户端一致）
  {
    const crypto = await import("node:crypto");
    const privDer = expectedPub?.[1]?.trim();
    const priv = crypto.createPrivateKey({ key: Buffer.from(privDer!, "base64"), format: "der", type: "pkcs8" });
    const payload = { name: pluginName, version: "1.0.0", main: "./main.cjs", entrySha256: "deadbeef".repeat(8) };
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(payload).sort()) (sorted as Record<string, unknown>)[k] = (payload as Record<string, unknown>)[k];
    const ok = crypto.verify(null, Buffer.from(JSON.stringify(sorted)), priv, Buffer.from(signature, "base64"));
    check("registry 签名可验（客户端语义一致）", ok);
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
