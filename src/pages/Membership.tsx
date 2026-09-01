import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import {
  useMembershipStore,
  fenToYuan,
  tierLabel,
  type MembershipPlan,
} from "../stores/membership";
import { useToastStore } from "../stores/toast";
import { useTokenStore, parseInsufficient } from "../stores/token";

export default function Membership() {
  const navigate = useNavigate();
  const { isLoggedIn, openLoginDialog, fetchProfile } = useAuthStore();
  const { plans, subscription, loading, loadPlans, loadStatus, subscribeNative } =
    useMembershipStore();
  const { addToast } = useToastStore();
  const { balance, loadBalance } = useTokenStore();

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (isLoggedIn) {
      loadStatus();
      loadBalance();
    }
  }, [isLoggedIn, loadStatus, loadBalance]);

  // 灵光点扣款开通：余额不足引导去钱包充值
  const handleUpgrade = async (plan: MembershipPlan, period: "monthly" | "annual") => {
    try {
      await subscribeNative(plan.id, period);
      addToast("success", "开通成功");
      await loadStatus();
      await loadBalance();
      await fetchProfile();
    } catch (e) {
      const insufficient = parseInsufficient(e);
      if (insufficient) {
        addToast(
          "error",
          `灵光点不足（当前 ${insufficient.balance}，需要 ${insufficient.required}），请先充值`,
        );
        navigate("/wallet");
      } else {
        addToast("error", String(e) || "开通失败");
      }
    }
  };

  // 未登录引导
  if (!isLoggedIn) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-[var(--text-normal)] mb-6">会员中心</h1>
          <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-10 text-center">
            <p className="text-[var(--text-muted)] mb-4">登录后即可查看会员权益并开通升级</p>
            <button
              onClick={() => openLoginDialog()}
              className="px-6 py-2.5 rounded-lg text-sm font-medium bg-[var(--interactive-accent)] text-[var(--text-on-accent)] hover:opacity-90"
            >
              登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentTier = subscription?.tier || "free";

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-[var(--text-normal)] mb-6">会员中心</h1>

        {/* 当前会员状态 */}
        <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-normal)]">当前会员</h2>
            {subscription?.auto_renew && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                自动续费
              </span>
            )}
          </div>
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">加载中...</p>
          ) : (
            <div className="flex items-end gap-6">
              <div>
                <p className="text-2xl font-bold text-[var(--interactive-accent)]">
                  {tierLabel[currentTier] || currentTier}
                </p>
                <p className="text-xs text-[var(--text-faint)] mt-1">
                  {subscription?.membership_expires_at
                    ? `到期：${new Date(subscription.membership_expires_at).toLocaleDateString()}`
                    : "永久有效"}
                </p>
              </div>
            </div>
          )}

          {/* 用量 */}
          <div className="grid grid-cols-2 gap-4 mt-5">
            <UsageBar label="牌组配额" limit={subscription?.deck_limit} unlimitedText="无限制" />
            <UsageBar
              label="每牌组卡片"
              limit={subscription?.card_limit_per_deck}
              unlimitedText="无限制"
            />
          </div>
        </div>

        {/* 灵光点余额 */}
        <button
          onClick={() => navigate("/wallet")}
          className="w-full rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-5 py-3 mb-5 flex items-center justify-between hover:border-[var(--interactive-accent)] transition-colors"
        >
          <span className="text-xs text-[var(--text-muted)]">灵光点余额</span>
          <span className="text-sm font-semibold text-amber-400">
            {balance?.balance ?? 0}
            <span className="text-xs font-normal text-[var(--text-faint)] ml-2">去充值 →</span>
          </span>
        </button>

        {/* 方案对比 */}
        <h2 className="text-sm font-medium text-[var(--text-normal)] mb-3">选择方案</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((plan) => {
              const isCurrent = plan.slug === currentTier;
              const isHighlight = plan.slug === "vip";
              return (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-5 flex flex-col ${
                    isHighlight
                      ? "border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/5"
                      : "border-[var(--background-modifier-border)] bg-[var(--background-secondary)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-[var(--text-normal)]">
                      {plan.name}
                    </h3>
                    {isCurrent && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                        当前
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-normal)] mb-1">
                    {plan.monthly_price === 0 ? "免费" : `¥${fenToYuan(plan.monthly_price)}`}
                    {plan.monthly_price !== 0 && (
                      <span className="text-xs font-normal text-[var(--text-faint)]">/月</span>
                    )}
                  </p>
                  {plan.annual_price > 0 && (
                    <p className="text-xs text-[var(--text-muted)] mb-4">
                      年付 ¥{fenToYuan(plan.annual_price)}
                      {plan.annual_discount_label && `（${plan.annual_discount_label}）`}
                    </p>
                  )}
                  <ul className="text-xs text-[var(--text-muted)] space-y-1.5 mb-5 flex-1">
                    <li>牌组：{plan.deck_limit === 0 ? "无限制" : `${plan.deck_limit} 个`}</li>
                    <li>
                      每牌组卡片：{plan.card_limit_per_deck === 0 ? "无限制" : `${plan.card_limit_per_deck} 张`}
                    </li>
                    <li>云同步：{plan.sync_enabled ? "支持" : "不支持"}</li>
                  </ul>

                  {isCurrent || plan.tier === 0 ? (
                    <button
                      disabled
                      className="w-full py-2 rounded-lg text-xs font-medium border border-[var(--background-modifier-border)] text-[var(--text-faint)] cursor-default"
                    >
                      {isCurrent ? "当前方案" : "免费方案"}
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleUpgrade(plan, "monthly")}
                        className="w-full py-2 rounded-lg text-xs font-medium bg-[var(--interactive-accent)] text-[var(--text-on-accent)] hover:opacity-90"
                      >
                        月付开通
                      </button>
                      {plan.annual_price > 0 && (
                        <button
                          onClick={() => handleUpgrade(plan, "annual")}
                          className="w-full py-2 rounded-lg text-xs font-medium border border-[var(--interactive-accent)]/30 text-[var(--interactive-accent)] hover:bg-[var(--interactive-accent)]/10"
                        >
                          年付开通
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        <button
          onClick={() => navigate("/settings")}
          className="mt-6 text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)]"
        >
          ← 返回设置
        </button>
      </div>

    </div>
  );
}

function UsageBar({
  label,
  limit,
  unlimitedText,
}: {
  label: string;
  limit?: number;
  unlimitedText: string;
}) {
  const unlimited = !limit || limit === 0;
  return (
    <div>
      <p className="text-xs text-[var(--text-faint)] mb-1">{label}</p>
      <p className="text-sm font-medium text-[var(--text-normal)]">
        {unlimited ? unlimitedText : `上限 ${limit}`}
      </p>
    </div>
  );
}
