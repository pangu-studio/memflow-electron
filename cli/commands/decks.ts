/** decks 子命令：list / add / rm */
import * as cloud from "../../electron/cloud";
import { resolveToken, printJson, printError, confirm, type GlobalFlags } from "../bin/memflow";

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function run(sub: string | undefined, args: string[], flags: GlobalFlags): Promise<void> {
  const { token } = resolveToken();
  switch (sub) {
    case "list":
    case "ls":
    case undefined:
      printJson(await cloud.cloudListDecks(token));
      break;
    case "add": {
      const name = args.find((a) => !a.startsWith("-"));
      if (!name) printError("用法: memflow decks add <name> [--description TEXT]");
      const deck = await cloud.cloudCreateDeck(token, name, opt(args, "--description"));
      printJson(deck);
      break;
    }
    case "rm": {
      const id = args.find((a) => !a.startsWith("-"));
      if (!id) printError("用法: memflow decks rm <id>");
      if (!(await confirm(`删除牌组 ${id}（级联删除卡片）？`, flags.yes))) {
        printError("已取消");
      }
      await cloud.cloudDeleteDeck(token, id);
      printJson({ ok: true, deleted: id });
      break;
    }
    default:
      printError(`未知 decks 子命令: ${sub}（可用: list/add/rm）`);
  }
}
