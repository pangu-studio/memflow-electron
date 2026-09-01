import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/auth";
import QRCode from "../components/QRCode";

export default function Login() {
  const {
    qrUrl,
    qrImg,
    qrStatus,
    qrHint,
    needBindEmail,
    startQRLogin,
    emailLogin,
    bindEmail,
    resetQR,
    token,
  } = useAuthStore();

  const [activeTab, setActiveTab] = useState<"qr" | "email">("qr");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Start QR login on mount（轮询循环由 store 内部接管）
  useEffect(() => {
    if (activeTab === "qr" && qrStatus === "idle") {
      startQRLogin();
    }
  }, [activeTab]);

  // Handle email login
  const handleEmailLogin = async () => {
    if (!email || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    setLoading(true);
    setError("");
    const err = await emailLogin(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  // Handle email binding for WeChat users
  const handleBindEmail = async () => {
    if (!email || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    setLoading(true);
    setError("");
    const err = await bindEmail(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  // Show email binding form for new WeChat users
  if (needBindEmail && token) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background-primary)]">
        <div className="w-full max-w-sm rounded-xl bg-[var(--background-secondary)] p-8 border border-[var(--background-modifier-border)] shadow-lg">
          <h2 className="mb-2 text-center text-xl font-bold text-[var(--text-normal)]">
            绑定邮箱
          </h2>
          <p className="mb-6 text-center text-sm text-[var(--text-muted)]">
            微信登录成功，请设置邮箱和密码以完成注册
          </p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-4 py-2.5 text-sm text-[var(--text-normal)] placeholder:text-[var(--text-faint)] focus:border-[var(--interactive-accent)] focus:outline-none"
          />
          <input
            type="password"
            placeholder="密码（至少6位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBindEmail()}
            className="mb-4 w-full rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-4 py-2.5 text-sm text-[var(--text-normal)] placeholder:text-[var(--text-faint)] focus:border-[var(--interactive-accent)] focus:outline-none"
          />
          <button
            onClick={handleBindEmail}
            disabled={loading}
            className="w-full rounded-lg bg-[var(--interactive-accent)] py-2.5 text-sm font-medium text-[var(--text-on-accent)] hover:bg-[var(--interactive-accent-hover)] disabled:opacity-50 transition-colors"
          >
            {loading ? "绑定中..." : "确认绑定"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background-primary)]">
      <div className="w-full max-w-sm rounded-xl bg-[var(--background-secondary)] p-8 border border-[var(--background-modifier-border)] shadow-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[var(--text-accent)]">
            MemFlow
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            同誉记忆
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex border-b border-[var(--background-modifier-border)]">
          <button
            onClick={() => setActiveTab("qr")}
            className={`flex-1 pb-2 text-sm font-medium ${
              activeTab === "qr"
                ? "border-b-2 border-[var(--interactive-accent)] text-[var(--text-accent)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            微信扫码登录
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className={`flex-1 pb-2 text-sm font-medium ${
              activeTab === "email"
                ? "border-b-2 border-[var(--interactive-accent)] text-[var(--text-accent)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            邮箱登录
          </button>
        </div>

        {/* QR Login Tab */}
        {activeTab === "qr" && (
          <div className="flex flex-col items-center">
            {qrStatus === "generating" && (
              <div className="flex h-[220px] w-[220px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--background-modifier-border)] border-t-[var(--interactive-accent)]" />
              </div>
            )}

            {(qrStatus === "pending" || qrStatus === "scanned") && (qrImg || qrUrl) && (
              <div className="relative">
                <QRCode url={qrUrl || ""} img={qrImg} />
                {qrStatus === "scanned" && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                    <div className="flex flex-col items-center gap-2 text-white">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span className="text-xs">扫码成功</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="mt-4 text-sm text-[var(--text-muted)]">{qrHint}</p>

            {qrStatus === "expired" && (
              <button
                onClick={() => {
                  resetQR();
                  startQRLogin();
                }}
                className="mt-3 text-sm text-[var(--text-accent)] hover:text-[var(--text-accent-hover)] transition-colors"
              >
                重新获取二维码
              </button>
            )}
          </div>
        )}

        {/* Email Login Tab */}
        {activeTab === "email" && (
          <div>
            {error && (
              <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <input
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-4 py-2.5 text-sm text-[var(--text-normal)] placeholder:text-[var(--text-faint)] focus:border-[var(--interactive-accent)] focus:outline-none"
            />
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
              className="mb-4 w-full rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-4 py-2.5 text-sm text-[var(--text-normal)] placeholder:text-[var(--text-faint)] focus:border-[var(--interactive-accent)] focus:outline-none"
            />
            <button
              onClick={handleEmailLogin}
              disabled={loading}
              className="w-full rounded-lg bg-[var(--interactive-accent)] py-2.5 text-sm font-medium text-[var(--text-on-accent)] hover:bg-[var(--interactive-accent-hover)] disabled:opacity-50 transition-colors"
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
