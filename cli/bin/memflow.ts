/**
 * memflow-cli（TypeScript 版，双轨过渡中）。
 * 复用 electron/ 服务模块（零 electron 依赖的部分）；输出机器可读 JSON。
 * 构建：esbuild bundle → out/cli/memflow.cjs（或用 bun build --compile 产单文件二进制）。
 */
import readline from "node:readline";
import { resolveEnvFlag, setEnvOverride, currentEnvKey } from "../../electron/config";
import * as authToken from "../../electron/authToken";
import * as cmdAuth from "../commands/auth";
import * as cmdReview from "../commands/review";
import * as cmdDecks from "../commands/decks";
import * as cmdCards from "../commands/cards";
import * as cmdGroups from "../commands/groups";
import * as cmdQuota from "../commands/quota";
import * as cmdStatus from "../commands/status";
import * as cmdSkill from "../commands/skill";

/** 打印 JSON 到 stdout */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** JSON 错误到 stderr，退出码 1（与 Rust output::print_error 一致） */
export function printError(msg: string): never {
  process.stderr.write(JSON.stringify({ error: msg }) + "\n");
  process.exit(1);
}

/** 领域错误（结构化）到 stderr，退出码 1 */
export function printErrorValue(err: Record<string, unknown>): never {
  process.stderr.write(JSON.stringify(err) + "\n");
  process.exit(1);
}

/** 破坏性操作确认（--yes 跳过） */
export function confirm(label: string, force: boolean): Promise<boolean> {
  if (force) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${label} [y/N]: `, (ans) => {
      rl.close();
      resolve(["y", "yes"].includes(ans.trim().toLowerCase()));
    });
  });
}

export interface GlobalFlags {
  appEnv?: string;
  yes: boolean;
}

/** 解析全局旗标（--app-env / -y/--yes），返回剩余参数 */
export function parseGlobalFlags(argv: string[]): { flags: GlobalFlags; rest: string[] } {
  const flags: GlobalFlags = { yes: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--app-env") flags.appEnv = argv[++i];
    else if (a.startsWith("--app-env=")) flags.appEnv = a.slice("--app-env=".length);
    else if (a === "-y" || a === "--yes") flags.yes = true;
    else rest.push(a);
  }
  if (flags.appEnv) {
    const { key, base } = resolveEnvFlag(flags.appEnv);
    setEnvOverride(key, base);
  }
  return { flags, rest };
}

/**
 * 解析当前 token（与桌面端共享存储）。
 * env_mismatch：token 登录环境与当前环境不一致（Rust 侧有提示，此处透传元数据）。
 */
export function resolveToken(): { token: string; env_mismatch?: boolean } {
  const stored = authToken.load();
  if (!stored) printError("未登录：请先运行 memflow auth token <TOKEN> 或在桌面端登录");
  const cur = currentEnvKey();
  return { token: stored.token, env_mismatch: !!stored.env && !!cur && stored.env !== cur };
}

/** 入口：node out/cli/memflow.cjs <subcommand> ... */
export async function main(): Promise<void> {
  const { flags, rest } = parseGlobalFlags(process.argv.slice(2));
  const [group, sub, ...args] = rest;
  try {
    switch (group) {
      case "auth":
        await cmdAuth.run(sub, args, flags);
        break;
      case "review":
        await cmdReview.run(sub, args, flags);
        break;
      case "decks":
        await cmdDecks.run(sub, args, flags);
        break;
      case "cards":
        await cmdCards.run(sub, args, flags);
        break;
      case "groups":
        await cmdGroups.run(sub, args, flags);
        break;
      case "quota":
        await cmdQuota.run(sub, args, flags);
        break;
      case "status":
        await cmdStatus.run(flags);
        break;
      case "skill":
        await cmdSkill.run(sub, args);
        break;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        printJson({
          ok: true,
          usage: "memflow [--app-env ENV|URL] [-y] <group> [sub] [args]",
          groups: ["auth", "review", "decks", "cards", "groups", "quota", "status", "skill"],
        });
        break;
      default:
        printError(`未知命令组: ${group}`);
    }
  } catch (e) {
    printError(e instanceof Error ? e.message : String(e));
  }
}

main();
