import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { invoke } from "@/lib/invoke";
import CardPreview from "../components/CardPreview";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { useStatsStore } from "../stores/stats";
import { useToastStore } from "../stores/toast";
import type { QueueItem } from "../types";

export default function Review() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState<number>(0);
  const [todayReviewed, setTodayReviewed] = useState(0);
  // 按牌组复习范围：URL ?deck=<id> 指定，null=全局队列（排除已暂停牌组）
  const [searchParams, setSearchParams] = useSearchParams();
  const scopeDeckId = searchParams.get("deck");
  const [scopeDeckName, setScopeDeckName] = useState<string>("");

  const { load: loadSettings } = useSettingsStore();
  const { stats, loadStats } = useStatsStore();

  const dailyLimit = useSettingsStore((s) => s.settings?.daily_limit) ?? 50;
  const remaining = dailyLimit - todayReviewed;

  /** 冲刷离线评分队列（FIFO），有成功出队时提示 */
  const flushPending = useCallback(async () => {
    const { token, user } = useAuthStore.getState();
    if (!token || !user) return;
    try {
      const { parameters, desiredRetention } =
        useSettingsStore.getState().getFsrsParams();
      const flushed = await invoke<number>("flush_pending_reviews", {
        token,
        userId: user.id,
        parameters: parameters ?? null,
        desiredRetention: desiredRetention ?? null,
      });
      if (flushed > 0) {
        useToastStore
          .getState()
          .addToast("info", `已同步 ${flushed} 条离线评分`);
      }
    } catch {
      // 离线/服务不可达时静默，队列保留待下次冲刷
    }
  }, []);

  const loadQueue = useCallback(async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      await loadSettings();
    } catch {
      // settings load can fail — use defaults
    }

    try {
      // 每日上限由服务端执行，客户端不再截断队列
      const data = await invoke<QueueItem[]>("cloud_get_review_queue", {
        token,
        deckId: scopeDeckId,
      });
      setQueue(data);
      if (scopeDeckId) {
        setScopeDeckName(data[0]?.deck_name ?? "");
      }

      // 加载统计数据（通过 store，后续每次复习后自动刷新）
      await loadStats();
      setTodayReviewed(useStatsStore.getState().stats?.today_reviewed ?? 0);

      if (data.length > 0) {
        setStartTime(Date.now());
      }
    } catch (e) {
      console.error("加载复习队列失败", e);
    } finally {
      setLoading(false);
    }
  }, [loadSettings, scopeDeckId]);

  useEffect(() => {
    loadQueue();
    // 进入复习页时先冲刷离线队列
    void flushPending();
  }, [loadQueue, flushPending]);

  /** 退出按牌组复习，回到全局队列 */
  const exitScope = () => {
    setSearchParams({});
    setQueue([]);
    setIndex(0);
    setFlipped(false);
    setLoading(true);
  };

  const handleRate = async (rating: number) => {
    const current = queue[index];
    if (!current) return;
    const { token, user } = useAuthStore.getState();

    const elapsedMs = Math.round(Date.now() - startTime);
    const { parameters, desiredRetention } =
      useSettingsStore.getState().getFsrsParams();

    // 评分事件：base 为评分时刻的卡片状态快照（含 version，409 重算起点）
    const event = {
      review_id: crypto.randomUUID(),
      card_id: current.card_id,
      cloze_num: current.cloze_num ?? 0,
      rating,
      elapsed_ms: elapsedMs,
      reviewed_at: new Date().toISOString(),
      base: {
        card_id: current.card_id,
        cloze_num: current.cloze_num ?? 0,
        stability: current.stability,
        difficulty: current.difficulty,
        reps: current.reps,
        lapses: current.lapses,
        state: current.state,
        version: current.version,
        last_review: current.last_review ?? null,
      },
    };

    if (token && user) {
      try {
        await invoke("submit_review", {
          token,
          userId: user.id,
          event,
          parameters: parameters ?? null,
          desiredRetention: desiredRetention ?? null,
        });
        // 提交成功，顺带冲刷可能积压的离线评分
        void flushPending();
      } catch (e) {
        const msg = String(e);
        if (msg.includes("已保存到离线队列")) {
          // 网络失败但评分已安全入队，不算错误
          useToastStore
            .getState()
            .addToast("info", "网络不可用，评分已保存到离线队列，恢复后自动同步");
        } else {
          useToastStore.getState().addToast("error", `提交评分失败：${msg}`);
        }
      }

      setTodayReviewed((prev) => prev + 1);
      // 刷新全局统计数据，驱动 SidebarRight / Stats 页同步更新
      useStatsStore.getState().loadStats();
    }

    const next = index + 1;
    if (next >= queue.length) {
      setQueue([]);
      setIndex(0);
    } else {
      setIndex(next);
      setFlipped(false);
      setStartTime(Date.now());
    }
  };

  // 键盘操作：空格/回车翻面，翻面后按 1-4 评分
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (queue.length === 0) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        void handleRate(Number(e.key));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--text-muted)]">加载中...</p>
      </div>
    );
  }

  // 已达每日上限
  if (remaining <= 0 && queue.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-[var(--text-muted)]">
          <div className="text-6xl mb-4">🎯</div>
          <p className="text-lg">今日复习已达上限</p>
          <p className="text-sm mt-2 text-[var(--text-faint)]">
            今日已复习 {todayReviewed} 张卡片（上限 {dailyLimit} 张）
          </p>
          <p className="text-xs mt-1 text-[var(--text-faint)]">
            可在设置中调整每日复习上限
          </p>
        </div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-[var(--text-muted)]">
          <div className="text-6xl mb-4">🎉</div>
          <p className="text-lg">
            {scopeDeckId ? "该牌组今日复习完成" : "今日复习完成"}
          </p>
          <p className="text-sm mt-2 text-[var(--text-faint)]">
            {scopeDeckId ? "可以退出牌组复习回到全局队列" : "去牌组建几张卡片吧"}
          </p>
          {scopeDeckId && (
            <button
              className="mt-4 px-4 py-2 rounded-lg text-sm bg-[var(--background-modifier-hover)] text-[var(--text-normal)] hover:bg-[var(--background-modifier-border)] transition-colors"
              onClick={exitScope}
            >
              退出牌组复习
            </button>
          )}
          {stats && (
            <div className="mt-4 flex items-center justify-center gap-6 text-xs text-[var(--text-muted)]">
              <span>📌 待复习 {stats.due_count} 张</span>
              <span>📝 累计 {stats.total_reps} 次复习</span>
              <span>📚 {stats.total_cards} 张卡片</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const current = queue[index];
  const progress = ((index + 1) / queue.length) * 100;

  return (
    // min-h-full 而非 h-full：窗口太矮时整页滚动（外层 main 有 overflow-auto），卡片不被挤压
    <div className="flex flex-col min-h-full px-6 py-5">
      {/* 进度条 */}
      <div className="w-full max-w-2xl mx-auto shrink-0 mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <p className="text-xs text-[var(--text-faint)] tabular-nums">
            {index + 1} / {queue.length}
          </p>
          <p className="text-xs text-[var(--text-faint)] tabular-nums">
            今日 {todayReviewed}/{dailyLimit}
          </p>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--background-modifier-border)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--interactive-accent)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 牌组名称 / 复习范围 */}
      {scopeDeckId ? (
        <div className="flex items-center gap-2 mb-3 shrink-0 max-w-2xl w-full mx-auto justify-center">
          <p className="text-xs text-[var(--interactive-accent)]">
            「{scopeDeckName || current.deck_name}」复习中
          </p>
          <button
            className="text-xs text-[var(--text-faint)] underline hover:text-[var(--text-normal)]"
            onClick={exitScope}
          >
            退出
          </button>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-faint)] mb-3 shrink-0 max-w-2xl w-full mx-auto text-center">
          {current.deck_name}
        </p>
      )}

      {/* 卡片：高度随内容自适应（min 320 / max 800 或视口减 140），垂直居中；
          超出上限时内容在卡片内部滚动；窗口太矮时整页滚动而不是把卡片压扁。
          卡片渲染与列表/编辑预览共用 CardPreview，观感一致 */}
      <div className="flex-1 min-h-[320px] w-full flex flex-col items-center justify-center">
        <CardPreview
          front={current.front}
          back={current.back}
          flipped={flipped}
          onFlip={() => setFlipped(!flipped)}
          clozeNum={current.cloze_num}
          className="max-w-2xl"
        />
      </div>

      {/* 底部操作区：固定高度，翻面时卡片不会跳动 */}
      <div className="shrink-0 w-full max-w-2xl mx-auto mt-4 h-11 flex items-center justify-center">
        {flipped ? (
          <div className="flex gap-3">
            <button
              onClick={() => handleRate(1)}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         bg-red-500/10 text-red-400 hover:bg-red-500/20
                         border border-red-500/20 transition-colors"
            >
              忘记 <span className="opacity-50 text-xs ml-0.5">1</span>
            </button>
            <button
              onClick={() => handleRate(2)}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         bg-orange-500/10 text-orange-400 hover:bg-orange-500/20
                         border border-orange-500/20 transition-colors"
            >
              困难 <span className="opacity-50 text-xs ml-0.5">2</span>
            </button>
            <button
              onClick={() => handleRate(3)}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         bg-blue-500/10 text-blue-400 hover:bg-blue-500/20
                         border border-blue-500/20 transition-colors"
            >
              良好 <span className="opacity-50 text-xs ml-0.5">3</span>
            </button>
            <button
              onClick={() => handleRate(4)}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         bg-green-500/10 text-green-400 hover:bg-green-500/20
                         border border-green-500/20 transition-colors"
            >
              简单 <span className="opacity-50 text-xs ml-0.5">4</span>
            </button>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-faint)]">
            点击卡片或按空格翻面
          </p>
        )}
      </div>
    </div>
  );
}
