/**
 * PluginRoute：插件路由守卫 + PluginSlot 错误边界。
 *
 * - 插件禁用（导航贡献点消失）→ 渲染兜底页"插件已禁用"，而非空白/报错；
 * - 插件组件渲染崩溃 → 错误边界兜底卡（重载/去插件管理），不拖垮主界面。
 */
import { Component, lazy, Suspense, type ReactNode, type ErrorInfo } from "react";
import { useUIRegistry, PLUGIN_ROUTES } from "@/lib/uiRegistry";

/** 插件路由守卫：禁用 → 兜底页 */
export function PluginRoute({ route, children }: { route: string; children: ReactNode }) {
  // 订阅贡献点表：插件启停即时反映（禁用 → 路由收敛到兜底页）
  const navigation = useUIRegistry((s) => s.table.navigation) as { route: string }[] | undefined;
  const plugin = PLUGIN_ROUTES[route];
  const available =
    !plugin || (navigation ?? []).some((n) => n.route === route);
  if (!available) {
    const plugin = PLUGIN_ROUTES[route] ?? "";
    const short = plugin.split(".").pop() ?? plugin;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <div className="text-lg opacity-80">插件已禁用</div>
        <div className="text-sm opacity-50 font-mono">{short}</div>
        <a href="#/plugins" className="text-sm opacity-70 underline underline-offset-4">
          前往插件管理 →
        </a>
      </div>
    );
  }
  return <>{children}</>;
}

interface BoundaryState {
  error: Error | null;
}

/** 错误边界：单插件组件崩溃的兜底卡 */
export class PluginErrorBoundary extends Component<{ name: string; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[plugin:${this.props.name}] 渲染崩溃:`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 m-2">
          <div className="text-sm font-medium text-red-400">插件「{this.props.name}」渲染失败</div>
          <div className="text-xs opacity-60 mt-1 font-mono">{this.state.error.message}</div>
          <div className="flex gap-3 mt-3 text-sm">
            <button
              className="opacity-80 hover:opacity-100 underline underline-offset-4"
              onClick={() => this.setState({ error: null })}
            >
              重载
            </button>
            <a href="#/plugins" className="opacity-80 hover:opacity-100 underline underline-offset-4">
              插件管理 →
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * PluginSlot：按贡献点渲染插件组件（懒加载 + Suspense + 错误边界）。
 * M2.3 样本：markdown-extras 的 renderer 占位组件；外部插件（Phase 3）经
 * componentLoader 解析模块。
 */
export function PluginSlot({
  plugin,
  component,
  fallback = null,
}: {
  plugin: string;
  /** renderer 模块导出名 */
  component: string;
  fallback?: ReactNode;
}) {
  const Loaded = lazy(
    () =>
      Promise.resolve({
        default: () => (
          <div className="text-xs opacity-40 font-mono p-2">
            [{plugin}:{component}] renderer 组件未安装（外部插件 Phase 3 加载）
          </div>
        ),
      })
  );
  return (
    <PluginErrorBoundary name={plugin}>
      <Suspense fallback={fallback}>
        <Loaded />
      </Suspense>
    </PluginErrorBoundary>
  );
}
