/**
 * auth 子命令：登录与 token 管理（与桌面端共享存储）。
 * - login：交互式登录。默认终端扫码（--method qr），--method email 走邮箱密码。
 * - token：直接写入已有 token（JWT 或 PAT），也可经 MEMFLOW_TOKEN 环境变量注入（不落盘）。
 * - bind-email：扫码登录后账号需绑定邮箱时使用。
 */
import QRCode from "qrcode";
import * as authToken from "../../electron/authToken";
import * as auth from "../../electron/auth";
import { currentEnvKey } from "../../electron/config";
import { printJson, printError, type GlobalFlags } from "../bin/memflow";

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const prefix = name + "=";
  const hit = args.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 交互式读取密码：TTY 下不回显；非 TTY 从 stdin 读一行 */
function promptSecret(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return new Promise((resolve, reject) => {
      process.stderr.write(question);
      let buf = "";
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.on("data", (ch) => (buf += ch));
      stdin.on("end", () => resolve(buf.trim()));
      stdin.on("error", reject);
    });
  }
  return new Promise((resolve) => {
    process.stderr.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    };
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n") {
          cleanup();
          process.stderr.write("\n");
          resolve(buf);
          return;
        }
        if (c === "\u0003") {
          cleanup();
          process.stderr.write("\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") {
          buf = buf.slice(0, -1);
        } else {
          buf += c;
        }
      }
    };
    stdin.on("data", onData);
  });
}

/** 登录成功后：保存 token + 建档（与桌面端一致），输出用户信息 */
async function finalizeLogin(token: string, needBindEmail?: boolean): Promise<void> {
  authToken.save(token, currentEnvKey());
  try {
    const profile = await auth.authGetProfile(token);
    const account = await auth.authRegisterAccount(token, profile);
    printJson({
      ok: true,
      logged_in: true,
      user: account,
      need_bind_email: !!needBindEmail,
      hint: needBindEmail
        ? "该账号尚未绑定邮箱，可执行 memflow auth bind-email --email <邮箱> --password <密码>"
        : undefined,
    });
  } catch {
    // profile 失败不阻塞：token 已保存
    printJson({ ok: true, logged_in: true, need_bind_email: !!needBindEmail });
  }
}

/** 邮箱密码登录 */
async function emailLogin(args: string[]): Promise<void> {
  const email = flagValue(args, "--email") ?? process.env.MEMFLOW_EMAIL;
  if (!email) printError("邮箱登录需要 --email（或 MEMFLOW_EMAIL 环境变量）");
  let password = flagValue(args, "--password") ?? process.env.MEMFLOW_PASSWORD;
  if (!password) password = await promptSecret("密码: ");
  if (!password) printError("密码为空");
  const resp = await auth.authEmailLogin(email, password);
  await finalizeLogin(resp.token, resp.need_bind_email);
}

/** 终端扫码登录：ASCII 渲染二维码 + 轮询（复用桌面端 qrstate 协议） */
async function qrLogin(args: string[]): Promise<void> {
  const timeoutSec = Number(flagValue(args, "--timeout") ?? 300);
  const qr = await auth.authRequestQr();
  const ascii = await QRCode.toString(qr.qr_url, { type: "terminal", small: true });
  process.stderr.write("请用微信扫描以下二维码登录：\n\n" + ascii + "\n");
  const deadline = Date.now() + timeoutSec * 1000;
  let scannedHintShown = false;
  for (;;) {
    if (Date.now() > deadline) printError("登录超时：请重新执行 memflow auth login");
    const poll = await auth.authPollQrOnce(qr.qr_id);
    if (poll.status === "authorized" && poll.token) {
      await finalizeLogin(poll.token, poll.need_bind_email);
      return;
    }
    if (poll.status === "expired") printError(poll.hint ?? "二维码已过期，请重新执行 memflow auth login");
    if (poll.status === "scanned" && !scannedHintShown) {
      process.stderr.write("已扫码，请在微信中确认登录…\n");
      scannedHintShown = true;
    }
    await sleep(1500);
  }
}

export async function run(sub: string | undefined, args: string[], _flags: GlobalFlags): Promise<void> {
  switch (sub) {
    case "login": {
      // memflow auth login [--method qr|email] [--email E [--password P]] [--timeout N]
      const method =
        flagValue(args, "--method") ??
        (flagValue(args, "--email") || process.env.MEMFLOW_EMAIL ? "email" : undefined);
      if (method === "email") {
        await emailLogin(args);
        return;
      }
      if (method && method !== "qr") printError(`未知登录方式: ${method}（可用: qr/email）`);
      if (!process.stderr.isTTY && !process.stdin.isTTY) {
        printError("非交互环境无法扫码：请用 --method email、memflow auth token <TOKEN> 或 MEMFLOW_TOKEN 环境变量");
      }
      await qrLogin(args);
      return;
    }
    case "bind-email": {
      // memflow auth bind-email --email E [--password P]
      const stored = authToken.load();
      if (!stored) printError("未登录：请先 memflow auth login");
      const email = flagValue(args, "--email") ?? process.env.MEMFLOW_EMAIL;
      if (!email) printError("bind-email 需要 --email");
      let password = flagValue(args, "--password") ?? process.env.MEMFLOW_PASSWORD;
      if (!password) password = await promptSecret("密码: ");
      const resp = await auth.authBindEmail(stored.token, email, password);
      await finalizeLogin(resp.token, false);
      return;
    }
    case "token": {
      // memflow auth token <TOKEN>：写入共享存储（JWT 或 PAT，等同桌面端登录态）
      const token = args[0];
      if (!token) printError("用法: memflow auth token <TOKEN>");
      authToken.save(token, currentEnvKey());
      printJson({ ok: true, saved: true });
      break;
    }
    case "status":
    case undefined: {
      const stored = authToken.load();
      const envToken = !!process.env.MEMFLOW_TOKEN?.trim();
      printJson({
        ok: true,
        logged_in: !!stored || envToken,
        token_source: envToken ? "env" : stored ? "store" : null,
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
      printError(`未知 auth 子命令: ${sub}（可用: login/bind-email/token/status/clear）`);
  }
}

export { flagValue };
