/**
 * 内置功能插件：牌组市场（com.memflow.market）。
 * 命令与贡献点经 PluginContext 注册，禁用（dispose）时自动注销。
 */
import { validateManifest } from "../../packages/plugin-api/src/index";
import type { PluginContext } from "../core/pluginApi";
import * as market from "../market";

const str = (v: unknown): string => v as string;
const optStr = (v: unknown): string | undefined => (v == null ? undefined : (v as string));

export const manifest = validateManifest({
  name: "com.memflow.market",
  version: "0.1.0",
  displayName: "牌组市场",
  description: "浏览、购买、导入社区牌组",
  contributes: {
    navigation: [{ id: "market", title: "市场", route: "/market" }],
    commands: [
      { name: "market_list_decks" },
      { name: "market_get_deck" },
      { name: "market_preview" },
      { name: "market_purchase" },
      { name: "market_import" },
    ],
  },
  defaultEnabled: true,
});

export function apply(ctx: PluginContext): void {
  ctx.registerCommand("market_list_decks", (a) =>
    market.marketListDecks(str(a.token), {
      category: optStr(a.category),
      keyword: optStr(a.keyword),
      pricing_type: optStr(a.pricing_type),
      sort: optStr(a.sort) ?? "sales",
      page: (a.page as number | undefined) ?? 1,
    })
  );
  ctx.registerCommand("market_get_deck", (a) => market.marketGetDeck(str(a.token), str(a.id)));
  ctx.registerCommand("market_preview", (a) => market.marketPreview(str(a.token), str(a.id)));
  ctx.registerCommand("market_purchase", (a) => market.marketPurchase(str(a.token), str(a.id)));
  ctx.registerCommand("market_import", (a) => market.marketImport(str(a.token), str(a.id)));
  ctx.registerContribution("navigation", manifest.contributes!.navigation![0]);
}
