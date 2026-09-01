/**
 * 内置插件索引：核心插件 + 4 个可启停功能插件。
 * initPlugins 按 plugins.json 决定挂载哪些功能插件；
 * list_plugins / set_plugin_enabled 提供查询与动态启停。
 */
import type { PluginContext } from "../core/pluginApi";
import type { RootRuntime } from "../core/pluginApi";
import { isPluginEnabled, setPluginEnabled } from "../pluginConfig";
import { validateManifest, type PluginManifest } from "../../packages/plugin-api/src/index";
import * as market from "./market";
import * as stats from "./stats";
import * as membership from "./membership";
import * as markdownExtras from "./markdownExtras";

export interface BuiltinPlugin {
  manifest: PluginManifest;
  apply: (ctx: PluginContext) => void;
}

/** 核心插件（恒加载）：仅注册内置命令，无贡献点 */
export const coreManifest = validateManifest({
  name: "com.memflow.core",
  version: "0.1.0",
  displayName: "核心",
  core: true,
});

export const featurePlugins: BuiltinPlugin[] = [
  { manifest: market.manifest, apply: market.apply },
  { manifest: stats.manifest, apply: stats.apply },
  { manifest: membership.manifest, apply: membership.apply },
  { manifest: markdownExtras.manifest, apply: markdownExtras.apply },
];

/** 启动时按配置挂载功能插件 */
export async function initFeaturePlugins(rt: RootRuntime): Promise<void> {
  for (const p of featurePlugins) {
    if (isPluginEnabled(p.manifest)) {
      await rt.mount(p.manifest, p.apply, p.manifest.inject);
    }
  }
}

export interface PluginInfo {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  core: boolean;
  enabled: boolean;
  mounted: boolean;
}

export function listPlugins(rt: RootRuntime): PluginInfo[] {
  return featurePlugins.map((p) => ({
    name: p.manifest.name,
    displayName: p.manifest.displayName,
    version: p.manifest.version,
    description: p.manifest.description,
    core: false,
    enabled: isPluginEnabled(p.manifest),
    mounted: rt.isMounted(p.manifest.name),
  }));
}

/** 动态启停；core 插件拒绝。返回操作后状态。 */
export async function setPluginEnabledCommand(rt: RootRuntime, name: string, enabled: boolean): Promise<PluginInfo> {
  const plugin = featurePlugins.find((p) => p.manifest.name === name);
  if (!plugin) throw new Error(`未知插件: ${name}`);
  if (plugin.manifest.core) throw new Error("核心插件不可禁用");
  setPluginEnabled(name, enabled);
  if (enabled && !rt.isMounted(name)) {
    await rt.mount(plugin.manifest, plugin.apply, plugin.manifest.inject);
  } else if (!enabled && rt.isMounted(name)) {
    await rt.unmount(name);
  }
  return {
    name: plugin.manifest.name,
    displayName: plugin.manifest.displayName,
    version: plugin.manifest.version,
    description: plugin.manifest.description,
    core: false,
    enabled,
    mounted: rt.isMounted(name),
  };
}
