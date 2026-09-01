import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "../stores/settings";
import { useApiEnvStore } from "../stores/apiEnv";

export default function ReviewSettings() {
  const { settings, loading, error, load, save, resetDefaults } =
    useSettingsStore();

  const [dailyLimit, setDailyLimit] = useState(50);
  const [desiredRetention, setDesiredRetention] = useState(0.9);
  const [maximumInterval, setMaximumInterval] = useState(36500);
  const [enableFuzz, setEnableFuzz] = useState(true);
  // 云端已有的个性化 FSRS 参数（w），保存时原样回传，避免被清空
  const [wParams, setWParams] = useState<number[] | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Hidden developer menu: click version 5 times within 2 seconds ──
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [showEnvPanel, setShowEnvPanel] = useState(false);

  const {
    buildProfile,
    canSwitch,
    available,
    loaded: envLoaded,
    load: loadEnv,
    apply: applyEnv,
    saved: envSaved,
  } = useApiEnvStore();

  const [selectedEnv, setSelectedEnv] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [envError, setEnvError] = useState<string | null>(null);

  // Load env info on mount
  useEffect(() => {
    loadEnv();
  }, []);

  // 加载复习设置
  useEffect(() => {
    load();
  }, []);

  // 同步本地状态
  useEffect(() => {
    if (settings) {
      setDailyLimit(settings.daily_limit);
      setDesiredRetention(settings.desired_retention);
      setMaximumInterval(settings.maximum_interval);
      setEnableFuzz(settings.enable_fuzz);
      // 如果 w 不为空且不为 "[]"，保留已有优化参数
      if (settings.w && settings.w !== "[]") {
        try {
          const w = JSON.parse(settings.w);
          if (Array.isArray(w) && w.length === 21) {
            setWParams(w);
          }
        } catch {
          // ignore parse error
        }
      }
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await save({
        daily_limit: dailyLimit,
        desired_retention: desiredRetention,
        maximum_interval: maximumInterval,
        w: wParams ? JSON.stringify(wParams) : "[]",
        enable_fuzz: enableFuzz,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error handled in store
    }
  };

  const handleReset = async () => {
    await resetDefaults();
    setWParams(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ── Hidden menu click handler ──
  const handleVersionClick = useCallback(() => {
    const now = Date.now();
    if (now - lastClickTime > 2000) {
      setClickCount(1);
    } else {
      const next = clickCount + 1;
      setClickCount(next);
      if (next >= 5) {
        setShowEnvPanel(true);
        setClickCount(0);
      }
    }
    setLastClickTime(now);
  }, [clickCount, lastClickTime]);

  const handleApplyEnv = async () => {
    if (!selectedEnv) {
      setEnvError("请选择环境");
      return;
    }
    if (selectedEnv === "custom" && !customUrl.trim()) {
      setEnvError("请输入自定义 URL");
      return;
    }
    if (selectedEnv === "custom" && !/^https?:\/\//.test(customUrl.trim())) {
      setEnvError("URL 必须以 http:// 或 https:// 开头");
      return;
    }
    setEnvError(null);
    const err = await applyEnv(selectedEnv, selectedEnv === "custom" ? customUrl.trim() : undefined);
    if (err) {
      setEnvError(err);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-[var(--text-normal)] mb-8">
          复习设置
        </h1>

        {loading && !settings && (
          <p className="text-[var(--text-muted)]">加载中...</p>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {saved && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            设置已保存
          </div>
        )}

        <div className="space-y-6">
          {/* 每日复习上限 */}
          <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5">
            <label className="block text-sm font-medium text-[var(--text-normal)] mb-2">
              每日复习上限
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={10}
                max={200}
                step={10}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                className="flex-1 h-2 rounded-full bg-[var(--background-modifier-border)] appearance-none cursor-pointer accent-[var(--interactive-accent)]"
              />
              <span className="text-sm font-mono text-[var(--text-accent)] w-12 text-right tabular-nums">
                {dailyLimit}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              每天最多复习的卡片数量（10-200 张）
            </p>
          </div>

          {/* 目标记忆保留率 */}
          <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5">
            <label className="block text-sm font-medium text-[var(--text-normal)] mb-2">
              目标记忆保留率
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0.7}
                max={0.97}
                step={0.01}
                value={desiredRetention}
                onChange={(e) =>
                  setDesiredRetention(Number(e.target.value))
                }
                className="flex-1 h-2 rounded-full bg-[var(--background-modifier-border)] appearance-none cursor-pointer accent-[var(--interactive-accent)]"
              />
              <span className="text-sm font-mono text-[var(--text-accent)] w-12 text-right tabular-nums">
                {(desiredRetention * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              更高的保留率意味着更频繁的复习。推荐 0.85-0.95
            </p>
          </div>

          {/* 最大间隔天数 */}
          <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5">
            <label className="block text-sm font-medium text-[var(--text-normal)] mb-2">
              最大间隔天数
            </label>
            <input
              type="number"
              min={1}
              max={36500}
              value={maximumInterval}
              onChange={(e) =>
                setMaximumInterval(Number(e.target.value))
              }
              className="w-full px-3 py-2 rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-primary)] text-[var(--text-normal)] text-sm focus:outline-none focus:border-[var(--interactive-accent)]"
            />
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              卡片复习间隔的上限（默认 36500 天 ≈ 100 年）
            </p>
          </div>

          {/* 间隔微调 */}
          <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-[var(--text-normal)]">
                  启用间隔微调
                </label>
                <p className="text-xs text-[var(--text-faint)] mt-0.5">
                  在到期时间上增加微小随机偏移，避免卡片聚集
                </p>
              </div>
              <button
                onClick={() => setEnableFuzz(!enableFuzz)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                  enableFuzz
                    ? "bg-[var(--interactive-accent)]"
                    : "bg-[var(--background-modifier-border)]"
                }`}
                role="switch"
                aria-checked={enableFuzz}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    enableFuzz ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* FSRS 参数（个性化参数迁移至云端优化，此处仅提示） */}
          {wParams && wParams.length === 21 && (
            <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-normal)]">
                    FSRS 个性化参数
                  </label>
                  <p className="text-xs text-[var(--text-faint)] mt-0.5">
                    当前使用个性化优化参数（21 个参数）
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-normal)] border border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] transition-colors"
                >
                  重置为默认参数
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 保存按钮 */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-[var(--interactive-accent)] text-[var(--text-on-accent)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "保存中..." : "保存设置"}
          </button>
          <a
            href="#/plugins"
            className="ml-4 text-sm opacity-60 hover:opacity-100 underline underline-offset-4"
          >
            插件管理 →
          </a>
        </div>

        {/* ── 服务器环境面板（仅 release 包 + 5 次连击版本号后显示）── */}
        {showEnvPanel && envLoaded && (
          <div className="rounded-xl border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-[var(--text-normal)]">
                服务器环境
              </label>
              <span className="text-xs text-[var(--text-faint)]">
                构建: {buildProfile}
              </span>
            </div>

            {!canSwitch ? (
              <div className="p-3 rounded-lg bg-[var(--background-modifier-border)]/30 text-xs text-[var(--text-muted)]">
                此功能仅在发布版可用
              </div>
            ) : (
              <>
                <div className="p-3 mb-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs">
                  ⚠️ 切换服务器将退出登录并清空同步记录，此功能仅供测试使用
                </div>

                {envError && (
                  <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {envError}
                  </div>
                )}

                {envSaved && (
                  <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
                    环境已保存，请重新登录
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                      选择环境
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {available.map((env) => (
                        <button
                          key={env.key}
                          onClick={() => setSelectedEnv(env.key)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                            selectedEnv === env.key
                              ? "bg-[var(--interactive-accent)]/20 border-[var(--interactive-accent)] text-[var(--interactive-accent)]"
                              : "border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:border-[var(--interactive-accent)]/40"
                          }`}
                        >
                          {env.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setSelectedEnv("custom")}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          selectedEnv === "custom"
                            ? "bg-[var(--interactive-accent)]/20 border-[var(--interactive-accent)] text-[var(--interactive-accent)]"
                            : "border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:border-[var(--interactive-accent)]/40"
                        }`}
                      >
                        自定义
                      </button>
                    </div>
                  </div>

                  {selectedEnv === "custom" && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                        自定义 URL
                      </label>
                      <input
                        type="text"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://my-test-api.example.com"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-primary)] text-[var(--text-normal)] text-sm focus:outline-none focus:border-[var(--interactive-accent)]"
                      />
                    </div>
                  )}

                  <button
                    onClick={handleApplyEnv}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--interactive-accent)] text-[var(--text-on-accent)] hover:opacity-90 transition-opacity"
                  >
                    保存并重启会话
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 版本号（连续点击 5 次唤出开发者菜单）── */}
        <div className="mt-8 text-center">
          <span
            onClick={handleVersionClick}
            className="text-xs text-[var(--text-faint)] cursor-default select-none"
            style={{ opacity: 0.4 }}
          >
            MemFlow Desktop
          </span>
        </div>
      </div>
    </div>
  );
}
