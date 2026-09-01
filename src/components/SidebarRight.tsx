import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { useUIStore } from "../stores/ui";
import { useCardsStore } from "../stores/cards";
import { useStatsStore } from "../stores/stats";
import MarkdownView from "./MarkdownView";

const TYPE_LABELS: Record<string, string> = {
  qa: "问答",
  cloze: "填空",
};

export default function SidebarRight() {
  const { rightTab, setRightTab } = useUIStore();
  const { selectedCard } = useCardsStore();
  const { stats, loadStats } = useStatsStore();
  const location = useLocation();

  // 牌组详情页 (/decks/:id) 按牌组口径统计总卡片数/待复习，其余页面为全局口径
  const deckId = location.pathname.match(/^\/decks\/([^/]+)/)?.[1] ?? null;

  // 挂载 + 路由（牌组）切换时按当前口径重拉
  useEffect(() => {
    loadStats(deckId);
  }, [deckId]);

  return (
    <aside className="flex flex-col w-[260px] h-full bg-[var(--background-secondary)] border-l border-[var(--background-modifier-border)]">
      {/* ── Tabs ────────────────────────── */}
      <Tabs.Root
        value={rightTab}
        onValueChange={(v) => setRightTab(v as "info" | "stats")}
        className="flex-1 flex flex-col min-h-0"
      >
        <Tabs.List className="flex border-b border-[var(--background-modifier-border)] px-2">
          <Tabs.Trigger
            value="info"
            className="flex-1 px-3 py-2 text-sm font-medium rounded-t
                       text-[var(--text-muted)]
                       data-[state=active]:text-[var(--text-normal)]
                       data-[state=active]:border-b-2 data-[state=active]:border-[var(--text-accent)]
                       hover:bg-[var(--background-modifier-hover)]
                       transition-colors"
          >
            信息
          </Tabs.Trigger>
          <Tabs.Trigger
            value="stats"
            className="flex-1 px-3 py-2 text-sm font-medium rounded-t
                       text-[var(--text-muted)]
                       data-[state=active]:text-[var(--text-normal)]
                       data-[state=active]:border-b-2 data-[state=active]:border-[var(--text-accent)]
                       hover:bg-[var(--background-modifier-hover)]
                       transition-colors"
          >
            统计
          </Tabs.Trigger>
        </Tabs.List>

        {/* Info tab — selected card details */}
        <Tabs.Content
          value="info"
          forceMount
          className="flex-1 overflow-y-auto p-4 data-[state=inactive]:hidden"
        >
          {selectedCard ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-[var(--background-primary)] p-3">
                <div className="text-xs text-[var(--text-faint)] mb-1">类型</div>
                <div className="text-sm font-medium text-[var(--text-normal)]">
                  {TYPE_LABELS[selectedCard.card_type] || selectedCard.card_type}
                </div>
              </div>

              {(selectedCard.tags ?? []).length > 0 && (
                <div className="rounded-lg bg-[var(--background-primary)] p-3">
                  <div className="text-xs text-[var(--text-faint)] mb-1">标签</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedCard.tags ?? []).map((t) => (
                      <span
                        key={t}
                        className="text-xs px-1.5 py-0.5 rounded bg-[var(--background-modifier-hover)] text-[var(--text-muted)]"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-[var(--background-primary)] p-3">
                <div className="text-xs text-[var(--text-faint)] mb-1">正面</div>
                <MarkdownView content={selectedCard.front} />
              </div>

              <div className="rounded-lg bg-[var(--background-primary)] p-3">
                <div className="text-xs text-[var(--text-faint)] mb-1">反面</div>
                <MarkdownView content={selectedCard.back} />
              </div>

              {selectedCard.created_at && (
                <div className="rounded-lg bg-[var(--background-primary)] p-3">
                  <div className="text-xs text-[var(--text-faint)] mb-1">创建时间</div>
                  <div className="text-xs text-[var(--text-normal)]">
                    {formatDate(selectedCard.created_at)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl mb-2 opacity-30">📋</p>
                <p className="text-sm text-[var(--text-muted)]">
                  选择卡片查看属性
                </p>
              </div>
            </div>
          )}
        </Tabs.Content>

        {/* Stats tab */}
        <Tabs.Content
          value="stats"
          forceMount
          className="flex-1 overflow-y-auto p-4 data-[state=inactive]:hidden"
        >
          <div className="space-y-3">
            {deckId && (
              <p className="text-xs text-[var(--text-faint)]">
                总卡片数 / 待复习为当前牌组口径，其余为全局
              </p>
            )}
            <MiniStat label="总卡片数" value={stats?.total_cards ?? "-"} />
            <MiniStat label="今日已复习" value={stats?.today_reviewed ?? "-"} />
            <MiniStat label="待复习" value={stats?.due_count ?? "-"} />
            <MiniStat label="累计复习" value={stats?.total_reps ?? "-"} />
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}

/* ── Mini stat row ─────────────────────── */
function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-[var(--background-primary)] p-3">
      <div className="text-xs text-[var(--text-faint)]">{label}</div>
      <div className="text-sm font-semibold text-[var(--text-normal)] mt-1">
        {value}
      </div>
    </div>
  );
}

/* ── Date formatter ──────────────────────── */
function formatDate(iso: string): string {
  try {
    // Normalize: SQLite datetime('now') stores naive UTC ("YYYY-MM-DD HH:MM:SS")
    // with no timezone marker, so we must treat such values as UTC before letting
    // toLocaleString convert them to local time. Only detect a *real* timezone
    // marker — a trailing Z/z, or a trailing numeric offset like +08:00 / -0500 —
    // so the date's own hyphens ("2026-06-23") don't trigger a false positive.
    let dateStr = iso.trim();
    const hasTz = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(dateStr);
    if (!hasTz) {
      dateStr = dateStr.replace(" ", "T") + "Z";
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}
