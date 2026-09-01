/**
 * memflow-plugin — MemFlow 插件开发者 CLI（库 + 入口分离）。
 *
 * 库导出：initPlugin / packPlugin / submitPlugin（抛 CliError）。
 * CLI 入口（底部 runCli）把 CliError 转 JSON 到 stderr + exit 1。
 *
 * 用法：
 *   memflow-plugin init <dir> --name com.example.hello --display-name "你好插件"
 *   memflow-plugin pack [dir] [--out DIR]
 *   memflow-plugin submit [dir] --token <JWT> [--api BASE]
 *
 * 信任模型（D11）：签名由 registry 在审核 approve 时完成（平台背书），开发者无需密钥。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { validateManifest, type PluginManifest } from "../../plugin-api/src/index";
import { postForm } from "./net";

export class CliError extends Error {}

// ---------------------------------------------------------------------------
// 库函数
// ---------------------------------------------------------------------------

export function readManifest(dir: string): PluginManifest {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf-8"));
  return validateManifest(raw);
}

export interface InitOptions {
  name: string;
  displayName?: string;
  version?: string;
  description?: string;
}

const MAIN_CJS = `// MemFlow 插件入口。ctx 为 PluginContext（见 @nssai/plugin-api 类型）。
// 可用：registerCommand / registerContribution / on / emit / effect / service
// 权限：manifest.permissions 声明后经 service() 消费核心服务（白名单强制）。
exports.apply = (ctx) => {
  ctx.registerCommand("hello_greet", () => ({ greeting: "hello from " + ctx.name }));
};
`;

export function initPlugin(dir: string, opts: InitOptions): { dir: string; files: string[] } {
  const manifest = validateManifest({
    name: opts.name,
    version: opts.version ?? "0.1.0",
    displayName: opts.displayName ?? opts.name,
    description: opts.description ?? "",
    main: "./main.cjs",
    permissions: [],
  });
  if (fs.existsSync(path.join(dir, "manifest.json"))) throw new CliError(`目录已有 manifest.json: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  const readme = `# ${manifest.displayName}

MemFlow 插件（${manifest.name} @ ${manifest.version}）。

## 开发 / 打包 / 发布

\`\`\`bash
memflow-plugin pack .                              # dist/${manifest.name}-${manifest.version}.tgz
memflow-plugin submit . --token <创作者 JWT>        # 提交后进入平台审核
\`\`\`

## 本地调试

拷贝到 MemFlow 数据目录 \`plugins/\` 下（开发模式未签名即可加载）。
`;
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "main.cjs"), MAIN_CJS);
  fs.writeFileSync(path.join(dir, "README.md"), readme);
  return { dir, files: ["manifest.json", "main.cjs", "README.md"] };
}

export interface PackResult {
  tgz: string;
  /** 入口文件 sha256（registry 签名载荷 entrySha256） */
  entrySha256: string;
  manifest: PluginManifest;
}

export function packPlugin(dir: string, outDir?: string): PackResult {
  const manifest = readManifest(dir);
  const mainRel = (manifest.main ?? "./main.cjs").replace(/^\.\//, "");
  const entryAbs = path.resolve(dir, mainRel);
  if (!fs.existsSync(entryAbs)) throw new CliError(`入口文件不存在: ${mainRel}`);
  const out = path.resolve(outDir ?? path.join(dir, "dist"));
  fs.mkdirSync(out, { recursive: true });
  const tgz = path.join(out, `${manifest.name}-${manifest.version}.tgz`);
  execFileSync("tar", ["-czf", tgz, "-C", dir, "manifest.json", mainRel]);
  const entrySha256 = crypto.createHash("sha256").update(fs.readFileSync(entryAbs)).digest("hex");
  return { tgz, entrySha256, manifest };
}

export interface SubmitOptions {
  token: string;
  api?: string;
}

export interface SubmitResult {
  plugin: string;
  version: string;
  status: string;
  packageUrl: string;
}

export async function submitPlugin(dir: string, opts: SubmitOptions): Promise<SubmitResult> {
  const api = (opts.api ?? process.env.MEMFLOW_API ?? "https://apis.memflow.com.cn").trimEnd();
  const packed = packPlugin(dir);
  const call = async (method: string, url: string, body?: unknown): Promise<Record<string, unknown>> => {
    const resp = await fetch(`${api}${url}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resp.ok) throw new CliError(`${method} ${url} → HTTP ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  };

  const plugin = (await call("POST", "/api/marketplace/plugins", {
    name: packed.manifest.name,
    display_name: packed.manifest.displayName,
    description: packed.manifest.description ?? "",
  })) as { id: string };

  const sign = (await call(
    "GET",
    `/api/marketplace/plugins/${plugin.id}/upload/sign?version=${encodeURIComponent(packed.manifest.version)}&ext=.tgz`
  )) as { host: string; key: string; policy: string; oss_access_key_id: string; signature: string; object_acl?: string; url: string };

  const fields: Record<string, string> = {
    key: sign.key,
    policy: sign.policy,
    OSSAccessKeyId: sign.oss_access_key_id,
    signature: sign.signature,
    success_action_status: "200",
  };
  if (sign.object_acl) fields["x-oss-object-acl"] = sign.object_acl;
  const up = await postForm(sign.host, fields, "file", fs.readFileSync(packed.tgz), path.basename(packed.tgz));
  if (up.status < 200 || up.status >= 300) throw new CliError(`OSS 上传失败: HTTP ${up.status} ${up.body.slice(0, 200)}`);

  const version = (await call("POST", `/api/marketplace/plugins/${plugin.id}/versions`, {
    version: packed.manifest.version,
    package_url: sign.url,
    package_name: path.basename(packed.tgz),
    package_size: fs.statSync(packed.tgz).size,
    sha256: packed.entrySha256,
    manifest: fs.readFileSync(path.join(dir, "manifest.json"), "utf-8"),
  })) as { status: string };

  return {
    plugin: packed.manifest.name,
    version: packed.manifest.version,
    status: version.status,
    packageUrl: sign.url,
  };
}

// ---------------------------------------------------------------------------
// CLI 入口
// ---------------------------------------------------------------------------

function opt(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1];
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

export function runCli(argv: string[]): void {
  const onFail = (msg: string): never => {
    process.stderr.write(JSON.stringify({ error: msg }) + "\n");
    process.exit(1);
  };
  const cmd = argv[0];
  const dir = path.resolve(argv[1] ?? ".");
  try {
    if (cmd === "init") {
      const name = opt(argv, "name");
      if (!name) onFail("用法: memflow-plugin init <dir> --name com.example.x [--display-name X]");
      console.log(
        JSON.stringify(
          initPlugin(dir, {
            name,
            displayName: opt(argv, "display-name"),
            version: opt(argv, "version"),
            description: opt(argv, "description"),
          }),
          null,
          2
        )
      );
    } else if (cmd === "pack") {
      const r = packPlugin(dir, opt(argv, "out"));
      console.log(
        JSON.stringify(
          { ok: true, tgz: r.tgz, entrySha256: r.entrySha256, name: r.manifest.name, version: r.manifest.version },
          null,
          2
        )
      );
    } else if (cmd === "submit") {
      const token = opt(argv, "token") ?? process.env.MEMFLOW_TOKEN;
      if (!token) onFail("缺少 --token / MEMFLOW_TOKEN（创作者登录 JWT）");
      void submitPlugin(dir, { token, api: opt(argv, "api") }).then(
        (r) =>
          console.log(
            JSON.stringify(
              { ok: true, ...r, hint: "已提交，等待平台审核；approve 后客户端可在插件市场一键安装" },
              null,
              2
            )
          ),
        (e) => onFail(e instanceof Error ? e.message : String(e))
      );
    } else {
      console.log(
        JSON.stringify(
          {
            usage: "memflow-plugin <init|pack|submit> [dir] [--name X] [--token JWT] [--api BASE]",
            commands: {
              init: "创建插件骨架（manifest.json + main.cjs + README.md）",
              pack: "校验 manifest 并产出 dist/<name>-<version>.tgz（输出入口 sha256）",
              submit: "注册插件 → OSS 直传 → 提交版本（registry 审核后背书签名）",
            },
          },
          null,
          2
        )
      );
    }
  } catch (e) {
    if (e instanceof CliError) onFail(e.message);
    throw e;
  }
}

// esbuild 打包为 CJS 入口时直接执行；被 vitest 导入（argv[1]=vitest）时跳过
if (process.argv[1] && /memflow-plugin|plugin-cli/.test(process.argv[1])) {
  runCli(process.argv.slice(2));
}
