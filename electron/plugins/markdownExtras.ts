/**
 * 内置功能插件：Markdown 渲染增强（com.memflow.markdown-extras）。
 * 纯 renderer 贡献占位插件（M2.3 接入 PluginSlot 后生效）；main 侧仅登记贡献点。
 */
import { validateManifest } from "../../packages/plugin-api/src/index";
import type { PluginContext } from "../core/pluginApi";

export const manifest = validateManifest({
  name: "com.memflow.markdown-extras",
  version: "0.1.0",
  displayName: "Markdown 增强",
  description: "卡片 Markdown 渲染增强（代码高亮主题、自定义容器等）",
  contributes: {
    cardRenderers: [{ id: "markdown-extras", match: "md", component: "MarkdownExtras" }],
  },
  defaultEnabled: true,
});

export function apply(ctx: PluginContext): void {
  ctx.registerContribution("cardRenderers", manifest.contributes!.cardRenderers![0]);
}
