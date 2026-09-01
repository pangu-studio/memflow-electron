import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAuthStore } from "../stores/auth";
import {
  useTokenStore,
  fenToYuan,
  txTypeLabel,
  type TokenPackage,
} from "../stores/token";
import { useToastStore } from "../stores/toast";
import QRCode from "../components/QRCode";

export default function Wallet() {
  const { isLoggedIn, openLoginDialog } = useAuthStore();
  const {
    balance,
    packages,
    transactions,
    loading,
    loadBalance,
    loadPackages,
    loadTransactions,
    rechargeNative,
  } = useTokenStore();
  const { addToast } = useToastStore();

  const [payOpen, setPayOpen] = useState(false);
  const [payPkg, setPayPkg] = useState<TokenPackage | null>(null);
  const [codeUrl, setCodeUrl] = useState("");
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      loadBalance();
      loadPackages();
      loadTransactions();
    }
  }, [isLoggedIn, loadBalance, loadPackages, loadTransactions]);

  // 扫码后轮询余额（充值回调入账）
  useEffect(() => {
    if (!payOpen || !codeUrl) return;
    setPolling(true);
    const before = balance?.balance ?? 0;
    const timer = setInterval(async () => {
      await loadBalance();
      const current = useTokenStore.getState().balance?.balance ?? 0;
      if (current !== before) {
        clearInterval(timer);
        setPolling(false);
        setPayOpen(false);
        addToast("success", "充值成功");
        loadTransactions();
      }
    }, 3000);
    return () => {
      clearInterval(timer);
      setPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payOpen, codeUrl]);

  const handleRecharge = async (pkg: TokenPackage) => {
    setPayPkg(pkg);
    setCodeUrl("");
    setPayOpen(true);
    try {
      const result = await rechargeNative(pkg.id);
      if (result?.payment?.code_url) {
        setCodeUrl(result.payment.code_url);
      } else {
        addToast("error", "创建支付订单失败，请稍后重试");
        setPayOpen(false);
      }
    } catch (e) {
      addToast("error", String(e) || "创建支付订单失败");
      setPayOpen(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-[var(--text-normal)] mb-6">灵光点钱包</h1>
          <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-10 text-center">
            <p className="text-[var(--text-muted)] mb-4">登录后即可查看余额并充值</p>
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

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-[var(--text-normal)] mb-6">灵光点钱包</h1>

        {/* 余额卡片 */}
        <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5 mb-6">
          <p className="text-xs text-[var(--text-faint)] mb-1">当前余额</p>
          <p className="text-3xl font-bold text-[var(--interactive-accent)]">
            {balance?.balance ?? 0}
            <span className="text-sm font-normal text-[var(--text-faint)] ml-2">灵光点</span>
          </p>
          <div className="flex gap-6 mt-3">
            <p className="text-xs text-[var(--text-muted)]">
              累计充值 {balance?.total_recharged ?? 0}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              累计消费 {balance?.total_consumed ?? 0}
            </p>
          </div>
        </div>

        {/* 充值档位 */}
        <h2 className="text-sm font-medium text-[var(--text-normal)] mb-3">充值</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          {packages.map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => handleRecharge(pkg)}
              disabled={loading}
              className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-4 text-center hover:border-[var(--interactive-accent)] transition-colors disabled:opacity-50"
            >
              <p className="text-xl font-bold text-[var(--text-normal)]">
                {pkg.token_amount}
                {pkg.bonus_amount > 0 && (
                  <span className="text-xs text-green-400 ml-1">+{pkg.bonus_amount}</span>
                )}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">¥{fenToYuan(pkg.price)}</p>
            </button>
          ))}
        </div>

        {/* 流水 */}
        <h2 className="text-sm font-medium text-[var(--text-normal)] mb-3">明细</h2>
        {transactions.length === 0 ? (
          <p className="text-xs text-[var(--text-faint)]">暂无灵光点流水</p>
        ) : (
          <div className="rounded-xl border border-[var(--background-modifier-border)] divide-y divide-[var(--background-modifier-border)]">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-[var(--text-normal)]">
                    {txTypeLabel[tx.type] || tx.type}
                    {tx.status === "pending" && (
                      <span className="text-xs text-blue-400 ml-2">待支付</span>
                    )}
                    {tx.status === "failed" && (
                      <span className="text-xs text-red-400 ml-2">已失败</span>
                    )}
                  </p>
                  {tx.remark && <p className="text-xs text-[var(--text-faint)]">{tx.remark}</p>}
                </div>
                <p
                  className={`text-sm font-semibold ${
                    tx.amount >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 扫码充值弹窗 */}
      <Dialog.Root open={payOpen} onOpenChange={setPayOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[360px] rounded-xl bg-[var(--background-primary)] border border-[var(--background-modifier-border)] shadow-[var(--shadow-modal)] p-6">
            <Dialog.Title className="text-base font-semibold text-[var(--text-normal)] mb-1">
              微信扫码充值
            </Dialog.Title>
            <Dialog.Description className="text-xs text-[var(--text-muted)] mb-4">
              {payPkg?.name} · {payPkg ? payPkg.token_amount + payPkg.bonus_amount : 0} 灵光点 · ¥
              {payPkg ? fenToYuan(payPkg.price) : ""}
            </Dialog.Description>
            {codeUrl ? (
              <div className="flex flex-col items-center">
                <QRCode url={codeUrl} size={220} />
                <p className="text-xs text-[var(--text-muted)] mt-4">
                  {polling ? "请使用微信扫码完成支付..." : "支付成功"}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px]">
                <p className="text-sm text-[var(--text-muted)]">正在生成二维码...</p>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
