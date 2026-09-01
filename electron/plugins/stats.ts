/**
 * 内置功能插件：统计（com.memflow.stats）。
 */
import { validateManifest } from "../../packages/plugin-api/src/index";
import type { PluginContext } from "../core/pluginApi";
import * as cloud from "../cloud";

const optStr = (v: unknown): string | undefined => (v == null ? undefined : (v as string));

export const manifest = validateManifest({
  name: "com.memflow.stats",
  version: "0.1.0",
  displayName: "统计",
  description: "今日/全局复习统计",
  contributes: {
    navigation: [{ id: "stats", title: "统计", route: "/stats" }],
    commands: [{ name: "cloud_get_stats" }, { name: "cloud_get_today_stats" }],
  },
  defaultEnabled: true,
});

export function apply(ctx: PluginContext): void {
  ctx.registerCommand("cloud_get_stats", (a) => cloud.cloudGetStats(str(a.token), optStr(a.deck_id)));
  ctx.registerCommand("cloud_get_today_stats", (a) => cloud.cloudGetTodayStats(str(a.token)));
  ctx.registerContribution("navigation", manifest.contributes!.navigation![0]);
}

function str(v: unknown): string {
  return v as string;
}
