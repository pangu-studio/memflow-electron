/**
 * 插件管理页（M2.2）：列出内置功能插件，动态启停。
 * 启停即时生效（命令注册/注销 + 贡献点下发），无需重启。
 */
import { useEffect, useState } from "react";
import { invoke } from "@/lib/invoke";

interface PluginInfo {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  enabled: boolean;
  mounted: boolean;
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setPlugins((await invoke<PluginInfo[]>("list_plugins")) ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const toggle = async (p: PluginInfo) => {
    setBusy(p.name);
    try {
      await invoke("set_plugin_enabled", { name: p.name, enabled: !p.enabled });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-xl font-semibold mb-1">插件管理</h1>
      <p className="text-sm opacity-60 mb-6">
        启停即时生效。禁用的插件命令与界面入口立即注销；页面路由在 UI Registry（M2.3）后动态收敛。
      </p>
      {error && <div className="text-sm text-red-400 mb-4">{error}</div>}
      {loading ? (
        <div className="opacity-60">加载中...</div>
      ) : (
        <div className="space-y-3">
          {plugins.map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between rounded-lg border border-[var(--background-modifier-border)] px-4 py-3"
            >
              <div>
                <div className="font-medium">
                  {p.displayName}
                  <span className="ml-2 text-xs opacity-40 font-mono">{p.version}</span>
                </div>
                {p.description && <div className="text-sm opacity-60 mt-0.5">{p.description}</div>}
                <div className="text-xs opacity-40 font-mono mt-0.5">{p.name}</div>
              </div>
              <button
                onClick={() => void toggle(p)}
                disabled={busy !== null}
                className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                  p.enabled
                    ? "bg-[var(--interactive-accent)] text-white"
                    : "border border-[var(--background-modifier-border)] opacity-70"
                }`}
              >
                {busy === p.name ? "..." : p.enabled ? "已启用" : "已禁用"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
