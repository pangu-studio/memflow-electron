/**
 * memflow skill 分发（移植自 memflow-desktop/src-tauri/src/cli/skill.rs）。
 * skills/memflow/ 是本仓库唯一事实来源（与 memflow-desktop 同内容），
 * 构建时经 esbuild --loader:.md=text 内嵌进 CLI 二进制。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { printJson, printError } from "../bin/memflow";

import SKILL_MD from "../../skills/memflow/SKILL.md";
import EXAMPLE_QA from "../../skills/memflow/examples/cards.qa.json";
import EXAMPLE_CLOZE from "../../skills/memflow/examples/cards.cloze.json";
import EXAMPLE_MD from "../../skills/memflow/examples/cards.md";

const FILES: [string, string][] = [
  ["SKILL.md", SKILL_MD as unknown as string],
  ["examples/cards.qa.json", JSON.stringify(EXAMPLE_QA, null, 2)],
  ["examples/cards.cloze.json", JSON.stringify(EXAMPLE_CLOZE, null, 2)],
  ["examples/cards.md", EXAMPLE_MD as unknown as string],
];

const SKILL_DIR_NAME = "memflow";
const CLI_VERSION = "0.2.1"; // 对齐 memflow-desktop crate 版本

interface Target {
  name: string;
  detect: string; // 相对 home
  user_skills: string; // 相对 home
  project_skills: string; // 相对 cwd
}

/** 目标目录映射表：新增 agent = 加一行 */
const TARGETS: Target[] = [
  { name: "claude", detect: ".claude", user_skills: ".claude/skills", project_skills: ".claude/skills" },
  { name: "openclaw", detect: ".openclaw", user_skills: ".openclaw/skills", project_skills: "skills" },
];

function home(): string {
  return os.homedir();
}

function skillsRoot(t: Target, scope: string): string {
  if (scope === "user") return path.join(home(), t.user_skills);
  if (scope === "project") return path.join(process.cwd(), t.project_skills);
  printError(`invalid scope: ${scope}（仅支持 user/project）`);
}

function resolveRoots(target: string, scope: string, dir?: string): [string, string][] {
  if (dir) return [["custom", dir]];
  if (target === "all") return TARGETS.map((t) => [t.name, skillsRoot(t, scope)]);
  if (target === "auto") {
    const detected = TARGETS.filter((t) => fs.existsSync(path.join(home(), t.detect)));
    if (detected.length === 0) {
      printError(
        "未探测到任何已知 agent（~/.claude、~/.openclaw 均不存在）。请用 --target 指定，或 --dir 显式给出 skills 根目录"
      );
    }
    return detected.map((t) => [t.name, skillsRoot(t, scope)]);
  }
  const t = TARGETS.find((x) => x.name === target);
  if (!t) printError(`unknown target: ${target}（支持 auto/claude/openclaw/all，或 --dir 显式指定）`);
  return [[t!.name, skillsRoot(t!, scope)]];
}

function cmdInstall(target: string, scope: string, dir?: string): void {
  const roots = resolveRoots(target, scope, dir);
  const installed: unknown[] = [];
  for (const [name, root] of roots) {
    const dest = path.join(root, SKILL_DIR_NAME);
    for (const [rel, content] of FILES) {
      const p = path.join(dest, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
    installed.push({ target: name, path: dest });
  }
  printJson({
    installed,
    files: FILES.length,
    hint: "skill 已写入（重复执行即更新到当前 CLI 内嵌版本）。重启或新开会话后 agent 即可发现 memflow skill",
  });
}

/** 从 SKILL.md frontmatter 提取 min-cli-version（轻量解析） */
function parseMinCliVersion(content: string): string | undefined {
  if (!content.startsWith("---")) return undefined;
  const fm = content.slice(3).split("\n---")[0];
  for (const line of fm.split("\n")) {
    const v = line.trim().match(/^min-cli-version:\s*(.+)$/);
    if (v) return v[1].trim().replace(/^"|"$/g, "");
  }
  return undefined;
}

/** 点分数字版本比较（非数字段按 0） */
function cmpVersion(a: string, b: string): number {
  const parse = (s: string) => s.split(".").map((p) => Number(p) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function checkOne(name: string, root: string): Record<string, unknown> {
  const dir = path.join(root, SKILL_DIR_NAME);
  const skillPath = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    return { target: name, path: dir, installed: false };
  }
  const content = fs.readFileSync(skillPath, "utf-8");
  const upToDate = content === (SKILL_MD as unknown as string);
  const min = parseMinCliVersion(content);
  const minOk = min ? cmpVersion(min, CLI_VERSION) <= 0 : true;
  const v: Record<string, unknown> = {
    target: name,
    path: dir,
    installed: true,
    up_to_date: upToDate,
    min_cli_version: min ?? null,
    cli_version: CLI_VERSION,
  };
  if (!upToDate) {
    v.hint = "已装 skill 与当前 CLI 内嵌版本不一致，执行 memflow-cli skill install 更新";
  } else if (!minOk) {
    v.hint = "已装 skill 要求更高版本 CLI，请升级 MemFlow 桌面端";
  }
  return v;
}

function cmdStatus(dir?: string): void {
  const h = home();
  const entries: Record<string, unknown>[] = TARGETS.map((t) => ({
    ...checkOne(t.name, path.join(h, t.user_skills)),
    agent_detected: fs.existsSync(path.join(h, t.detect)),
  }));
  if (dir) entries.push(checkOne("custom", dir));
  printJson({ skills: entries });
}

/** 入口：run("show"|"install"|"status", args) */
export async function run(sub: string | undefined, args: string[]): Promise<void> {
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    if (i >= 0) return args[i + 1];
    const hit = args.find((a) => a.startsWith(name + "="));
    return hit?.slice(name.length + 1);
  };
  switch (sub) {
    case "show":
    case undefined:
      process.stdout.write(SKILL_MD as unknown as string);
      break;
    case "install":
      cmdInstall(opt("--target") ?? "auto", opt("--scope") ?? "user", opt("--dir"));
      break;
    case "status":
      cmdStatus(opt("--dir"));
      break;
    default:
      printError(`未知 skill 子命令: ${sub}（可用: show/install/status）`);
  }
}
