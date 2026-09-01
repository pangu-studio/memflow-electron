/** quota 子命令：show（云端实时配额） */
import * as membership from "../../electron/membership";
import * as accounts from "../../electron/accounts";
import { resolveToken, printJson, printError, type GlobalFlags } from "../bin/memflow";

export async function run(sub: string | undefined, _args: string[], _flags: GlobalFlags): Promise<void> {
  const { token } = resolveToken();
  switch (sub) {
    case "show":
    case undefined: {
      const acc = accounts.current();
      if (!acc) printError("quota 需要已建档账号（accounts.json current 条目）");
      printJson(await membership.membershipRefreshQuota(token, acc!.user_id));
      break;
    }
    default:
      printError(`未知 quota 子命令: ${sub}（可用: show）`);
  }
}
