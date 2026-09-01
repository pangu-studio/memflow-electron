/** groups 子命令：list */
import * as cloud from "../../electron/cloud";
import { resolveToken, printJson, printError, type GlobalFlags } from "../bin/memflow";

export async function run(sub: string | undefined, _args: string[], _flags: GlobalFlags): Promise<void> {
  const { token } = resolveToken();
  switch (sub) {
    case "list":
    case "ls":
    case undefined:
      printJson(await cloud.cloudListGroups(token));
      break;
    default:
      printError(`未知 groups 子命令: ${sub}（可用: list）`);
  }
}
