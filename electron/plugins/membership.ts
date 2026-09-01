/**
 * 内置功能插件：会员与灵光点（com.memflow.membership）。
 */
import { validateManifest } from "../../packages/plugin-api/src/index";
import type { PluginContext } from "../core/pluginApi";
import * as membership from "../membership";
import * as token from "../token";

const str = (v: unknown): string => v as string;

export const manifest = validateManifest({
  name: "com.memflow.membership",
  version: "0.1.0",
  displayName: "会员",
  description: "会员计划、配额与灵光点",
  contributes: {
    navigation: [{ id: "membership", title: "会员", route: "/membership" }],
    commands: [
      { name: "membership_list_plans" },
      { name: "membership_get_status" },
      { name: "membership_refresh_quota" },
      { name: "membership_get_quota_cache" },
      { name: "membership_subscribe_native" },
      { name: "token_get_balance" },
      { name: "token_list_packages" },
      { name: "token_list_transactions" },
      { name: "token_recharge_native" },
    ],
  },
  defaultEnabled: true,
});

export function apply(ctx: PluginContext): void {
  ctx.registerCommand("membership_list_plans", () => membership.membershipListPlans());
  ctx.registerCommand("membership_get_status", (a) => membership.membershipGetStatus(str(a.token)));
  ctx.registerCommand("membership_refresh_quota", (a) =>
    membership.membershipRefreshQuota(str(a.token), str(a.user_id))
  );
  ctx.registerCommand("membership_get_quota_cache", (a) => membership.membershipGetQuotaCache(str(a.user_id)));
  ctx.registerCommand("membership_subscribe_native", (a) =>
    membership.membershipSubscribeNative(str(a.token), str(a.plan_id), str(a.period))
  );
  ctx.registerCommand("token_get_balance", (a) => token.tokenGetBalance(str(a.token)));
  ctx.registerCommand("token_list_packages", (a) => token.tokenListPackages(str(a.token)));
  ctx.registerCommand("token_list_transactions", (a) => token.tokenListTransactions(str(a.token), (a.page as number) ?? 1));
  ctx.registerCommand("token_recharge_native", (a) => token.tokenRechargeNative(str(a.token), str(a.package_id)));
  ctx.registerContribution("navigation", manifest.contributes!.navigation![0]);
}
