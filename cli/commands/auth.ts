/** auth 子命令：token 管理（与桌面端共享存储） */
import * as authToken from "../../electron/authToken";
import { currentEnvKey } from "../../electron/config";
import { printJson, printError, type GlobalFlags } from "../bin/memflow";

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const prefix = name + "=";
  const hit = args.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

export async function run(sub: string | undefined, args: string[], _flags: GlobalFlags): Promise<void> {
  switch (sub) {
    case "token": {
      // memflow auth token <TOKEN>：写入共享存储（等同桌面端登录态）
      const token = args[0];
      if (!token) printError("用法: memflow auth token <TOKEN>");
      authToken.save(token, currentEnvKey());
      printJson({ ok: true, saved: true });
      break;
    }
    case "status":
    case undefined: {
      const stored = authToken.load();
      printJson({
        ok: true,
        logged_in: !!stored,
        env: stored?.env ?? null,
        current_env: currentEnvKey() ?? null,
      });
      break;
    }
    case "clear":
      authToken.clear();
      printJson({ ok: true, cleared: true });
      break;
    default:
      printError(`未知 auth 子命令: ${sub}（可用: token/status/clear）`);
  }
}

export { flagValue };
