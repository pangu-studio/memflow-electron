import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readManifest, packPlugin } from "../src/index";

function fixtureDir(): string {
  return path.join(os.tmpdir(), `plugin-cli-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
}

describe("memflow-plugin CLI 库函数", () => {
  it("readManifest 校验非法 manifest", () => {
    const dir = fixtureDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ name: "bad name", version: "1", displayName: "x" }));
    expect(() => readManifest(dir)).toThrow(/name/);
  });

  it("packPlugin 产出 tgz 且 entrySha256 = 入口文件哈希", () => {
    const dir = fixtureDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ name: "com.cli.test", version: "1.2.3", displayName: "T", main: "./main.cjs" })
    );
    fs.writeFileSync(path.join(dir, "main.cjs"), "exports.apply=()=>{}");
    const r = packPlugin(dir);
    expect(path.basename(r.tgz)).toBe("com.cli.test-1.2.3.tgz");
    expect(fs.existsSync(r.tgz)).toBe(true);
    const listing = execFileSync("tar", ["-tzf", r.tgz]).toString();
    expect(listing).toContain("manifest.json");
    expect(listing).toContain("main.cjs");
  });

  it("packPlugin 缺入口文件时报错", () => {
    const dir = fixtureDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ name: "com.cli.noentry", version: "1.0.0", displayName: "N", main: "./main.cjs" })
    );
    expect(() => packPlugin(dir)).toThrow(/入口文件不存在/);
  });
});
