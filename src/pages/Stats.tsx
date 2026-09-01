import { useEffect } from "react";
import { useStatsStore } from "../stores/stats";

export default function Stats() {
  const { stats, loadStats } = useStatsStore();

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-[var(--text-normal)] mb-6">
        学习统计
      </h1>
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="今日复习" value={stats?.today_reviewed ?? "-"} />
        <StatCard label="待复习" value={stats?.due_count ?? "-"} />
        <StatCard label="总卡片数" value={stats?.total_cards ?? "-"} />
        <StatCard label="累计复习" value={stats?.total_reps ?? "-"} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl p-6 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)]">
      <div className="text-sm text-[var(--text-muted)]">{label}</div>
      <div className="text-3xl font-bold mt-1 text-[var(--text-normal)]">
        {value}
      </div>
    </div>
  );
}
