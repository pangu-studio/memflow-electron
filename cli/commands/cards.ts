/** cards 子命令：list / add / rm */
import * as cloud from "../../electron/cloud";
import { resolveToken, printJson, printError, confirm, type GlobalFlags } from "../bin/memflow";

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function clozeNums(front: string): number[] {
  const m = front.match(/\{\{c(\d+)::/g);
  if (!m) return [];
  return [...new Set(m.map((s) => Number(s.match(/\d+/)![0])))].sort((a, b) => a - b);
}

export async function run(sub: string | undefined, args: string[], flags: GlobalFlags): Promise<void> {
  const { token } = resolveToken();
  switch (sub) {
    case "list":
    case "ls":
    case undefined: {
      const deckId = opt(args, "--deck");
      const keyword = opt(args, "--keyword");
      const resp = await cloud.cloudListCards(token, {
        deck_id: deckId,
        keyword,
        page: 1,
        page_size: Number(opt(args, "--limit") ?? 20),
      });
      printJson(resp);
      break;
    }
    case "add": {
      const deckId = opt(args, "--deck");
      const front = opt(args, "--front");
      const back = opt(args, "--back");
      if (!deckId || !front || !back) {
        printError("用法: memflow cards add --deck <id> --front <md> --back <md>");
      }
      const card = await cloud.cloudCreateCard(
        token,
        deckId!,
        front!,
        back!,
        opt(args, "--type") ?? "qa",
        [],
        clozeNums(front!)
      );
      printJson(card);
      break;
    }
    case "rm": {
      const id = args.find((a) => !a.startsWith("-"));
      if (!id) printError("用法: memflow cards rm <id>");
      if (!(await confirm(`删除卡片 ${id}？`, flags.yes))) printError("已取消");
      await cloud.cloudDeleteCard(token, id);
      printJson({ ok: true, deleted: id });
      break;
    }
    default:
      printError(`未知 cards 子命令: ${sub}（可用: list/add/rm）`);
  }
}
