/**
 * 插件市场页（M3.2）：浏览公开插件 + 一键安装（下载/验签/挂载自动完成）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@/lib/invoke";

interface PluginItem {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  latest_version?: string;
  install_count?: number;
}

export default function PluginMarketPage() {
  const [items, setItems] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  const refresh = async () => {
    try {
      const resp = (await invoke<{ items: PluginItem[] }>("marketplace_list", { keyword: null, page: 1 })) ?? { items: [] };
      setItems(resp.items ?? []);
      const local = (await invoke<{ name: string }[]>("list_plugins")) ?? [];
      setInstalled(new Set(local.map((p) => p.name)));
    } catch (e) {
      setMessage({ kind: "err", text: String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async (p: PluginItem) => {
    setInstalling(p.name);
    setMessage(null);
    try {
      await invoke("marketplace_install", { name: p.name });
      setMessage({ kind: "ok", text: `已安装 ${p.display_name}（下载→验签→挂载完成）` });
      await refresh();
    } catch (e) {
      setMessage({ kind: "err", text: `安装失败：${String(e)}` });
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-xl font-semibold mb-1">插件市场</h1>
      <p className="text-sm opacity-60 mb-6">安装经 registry ed25519 验签；插件权限按 manifest 白名单强制执行（插件管理可启停）。</p>
      {message && (
        <div className={`text-sm mb-4 ${message.kind === "ok" ? "opacity-80" : "text-red-400"}`}>{message.text}</div>
      )}
      {loading ? (
        <div className="opacity-60">加载中...</div>
      ) : items.length === 0 ? (
        <div className="opacity-50">暂无上架插件</div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-[var(--background-modifier-border)] px-4 py-3"
            >
              <div>
                <div className="font-medium">
                  {p.display_name}
                  {p.latest_version && <span className="ml-2 text-xs opacity-40 font-mono">v{p.latest_version}</span>}
                </div>
                {p.description && <div className="text-sm opacity-60 mt-0.5">{p.description}</div>}
                <div className="text-xs opacity-40 font-mono mt-0.5">{p.name}</div>
              </div>
              <button
                onClick={() => void install(p)}
                disabled={installing !== null || installed.has(p.name)}
                className="px-4 py-1.5 rounded-md text-sm bg-[var(--interactive-accent)] text-white disabled:opacity-40"
              >
                {installing === p.name ? "安装中..." : installed.has(p.name) ? "已安装" : "安装"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
