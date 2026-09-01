import { describe, expect, it } from "vitest";
import http from "node:http";
import { postForm, downloadBuffer } from "../src/net";

describe("net（multipart/下载）", () => {
  it("postForm 构造合法 multipart 体", async () => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ got: body, ct: req.headers["content-type"] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const { status, body } = await postForm(
      `http://127.0.0.1:${port}/up`,
      { key: "a/b.tgz", policy: "POL", success_action_status: "200" },
      "file",
      Buffer.from("FAKE-TGZ-BYTES"),
      "pkg.tgz"
    );
    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { got: string; ct: string };
    expect(parsed.ct).toContain("multipart/form-data; boundary=");
    expect(parsed.got).toContain('name="key"');
    expect(parsed.got).toContain("a/b.tgz");
    expect(parsed.got).toContain('filename="pkg.tgz"');
    expect(parsed.got).toContain("FAKE-TGZ-BYTES");
    expect(parsed.got.trimEnd().endsWith("--")).toBe(true);
    server.close();
  });

  it("downloadBuffer 返回响应体", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end("hello-bytes");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const buf = await downloadBuffer(`http://127.0.0.1:${port}/x`);
    expect(buf.toString()).toBe("hello-bytes");
    server.close();
  });
});
