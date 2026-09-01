import { describe, expect, it } from "vitest";
import { validateManifest, type PluginManifest } from "../src/index";

const valid = {
  name: "com.memflow.market",
  version: "1.0.0",
  displayName: "牌组市场",
  contributes: {
    navigation: [{ id: "market", title: "市场", route: "/market" }],
    commands: [{ name: "market_list_decks" }],
  },
  permissions: ["cloud.read", "network"],
};

describe("validateManifest", () => {
  it("接受合法 manifest 并保留字段", () => {
    const m = validateManifest(valid);
    expect(m.name).toBe("com.memflow.market");
    expect(m.contributes?.navigation?.[0].route).toBe("/market");
    expect(m.permissions).toContain("cloud.read");
  });

  it("缺 name/version/displayName 抛错并带路径", () => {
    expect(() => validateManifest({ version: "1.0.0", displayName: "x" })).toThrow(/manifest\.name/);
    expect(() => validateManifest({ name: "a.b", displayName: "x" })).toThrow(/manifest\.version/);
  });

  it("name 格式校验（反域名）", () => {
    expect(() => validateManifest({ ...valid, name: "Bad Name" })).toThrow(/name/);
  });

  it("未知权限被拒绝", () => {
    expect(() => validateManifest({ ...valid, permissions: ["root"] })).toThrow(/permissions\[0\]/);
  });

  it("命令名必须 snake_case", () => {
    expect(() =>
      validateManifest({ ...valid, contributes: { commands: [{ name: "badName" }] } })
    ).toThrow(/commands\[0\]\.name/);
  });

  it("导航 route 必须以 / 开头", () => {
    expect(() =>
      validateManifest({ ...valid, contributes: { navigation: [{ id: "a", title: "b", route: "x" }] } })
    ).toThrow(/navigation\[0\]\.route/);
  });

  it("contributes 条目缺字段时报路径", () => {
    expect(() =>
      validateManifest({ ...valid, contributes: { navigation: [{ id: "a" }] } })
    ).toThrow(/navigation\[0\]/);
  });

  it("可选字段缺省为 undefined", () => {
    const m: PluginManifest = validateManifest({
      name: "com.x.y",
      version: "0.1.0",
      displayName: "Y",
    });
    expect(m.contributes).toBeUndefined();
    expect(m.permissions).toBeUndefined();
    expect(m.inject).toBeUndefined();
  });
});
