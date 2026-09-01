/**
 * 代理感知的 HTTP 工具（零依赖，Node http/tls 直连 + CONNECT 隧道）。
 *
 * Node 全局 fetch 不感知 *_proxy 环境变量；受限网络下 OSS 等外网端点
 * 需要显式走代理。实现最小 HTTP/1.1 客户端：
 * - 无代理 → http/https 直连
 * - 有 https_proxy/http_proxy → CONNECT 隧道 + TLS
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

export function proxyUrl(): string | null {
  return process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY ?? null;
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

function directRequest(url: URL, method: string, headers: Record<string, string>, body: Buffer): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      { hostname: url.hostname, port: url.port || (url.protocol === "https:" ? 443 : 80), path: url.pathname + url.search, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string>, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

function tunnelRequest(proxy: URL, url: URL, method: string, headers: Record<string, string>, body: Buffer): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.hostname, port: Number(proxy.port) || 1080 }, () => {
      socket.write(`CONNECT ${url.hostname}:443 HTTP/1.1\r\nHost: ${url.hostname}:443\r\n\r\n`);
      let buf = Buffer.alloc(0);
      const onData = (d: Buffer) => {
        buf = Buffer.concat([buf, d]);
        const idx = buf.indexOf("\r\n\r\n");
        if (idx < 0) return;
        socket.removeListener("data", onData);
        const head = buf.slice(0, idx).toString();
        if (!head.includes(" 200")) {
          socket.destroy();
          return reject(new Error(`代理 CONNECT 失败: ${head.split("\r\n")[0]}`));
        }
        const rest = buf.slice(idx + 4);
        const tlsSock = tls.connect({ socket, servername: url.hostname }, () => {
          const reqHead =
            `${method} ${url.pathname}${url.search} HTTP/1.1\r\n` +
            `Host: ${url.host}\r\n` +
            Object.entries(headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\r\n") +
            `\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`;
          tlsSock.write(Buffer.concat([Buffer.from(reqHead), rest, body]));
        });
        const chunks: Buffer[] = [];
        tlsSock.on("data", (c: Buffer) => chunks.push(c));
        tlsSock.on("end", () => {
          const raw = Buffer.concat(chunks);
          const split = raw.indexOf("\r\n\r\n");
          const headText = raw.slice(0, split).toString();
          const status = Number(headText.split(" ")[1]) || 0;
          resolve({ status, headers: {}, body: raw.slice(split + 4) });
        });
        tlsSock.on("error", reject);
      };
      socket.on("data", onData);
      socket.on("error", reject);
    });
    socket.on("error", reject);
  });
}

async function rawRequest(urlStr: string, method: string, headers: Record<string, string>, body: Buffer): Promise<RawResponse> {
  const url = new URL(urlStr);
  const proxy = proxyUrl();
  if (proxy && url.protocol === "https:") return tunnelRequest(new URL(proxy), url, method, headers, body);
  if (proxy && url.protocol === "http:") {
    const p = new URL(proxy);
    return directRequest(new URL(`${p.protocol}//${p.host}`), method, { ...headers, Host: url.host }, Buffer.concat([Buffer.from(`${method} ${url.pathname}${url.search} HTTP/1.1\r\n`), Buffer.alloc(0)]));
  }
  return directRequest(url, method, headers, body);
}

/** 下载（返回 Buffer）；HTTPS 经代理时走 CONNECT 隧道 */
export async function downloadBuffer(url: string): Promise<Buffer> {
  const r = await rawRequest(url, "GET", { "User-Agent": "memflow-plugin-cli" }, Buffer.alloc(0));
  if (r.status < 200 || r.status >= 300) throw new Error(`下载失败: HTTP ${r.status}`);
  return r.body;
}

/** multipart/form-data POST（OSS PostObject 直传用）；自动处理代理 */
export async function postForm(
  url: string,
  fields: Record<string, string>,
  fileField: string,
  fileBuf: Buffer,
  fileName: string
): Promise<{ status: number; body: string }> {
  const boundary = "----memflow" + Date.now().toString(16);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: application/gzip\r\n\r\n`
    )
  );
  parts.push(fileBuf);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  const r = await rawRequest(url, "POST", { "Content-Type": `multipart/form-data; boundary=${boundary}` }, body);
  return { status: r.status, body: r.body.toString() };
}
