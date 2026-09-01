import { useEffect, useState, Fragment } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import DeckList from "./pages/DeckList";
import DeckDetail from "./pages/DeckDetail";
import Review from "./pages/Review";
import ReviewSettings from "./pages/ReviewSettings";
import PluginsPage from "./pages/Plugins";
import { PluginRoute } from "./components/PluginSlot";
import { initUIRegistry } from "./lib/uiRegistry";
import Membership from "./pages/Membership";
import Market from "./pages/Market";
import Wallet from "./pages/Wallet";
import Stats from "./pages/Stats";
import Login from "./pages/Login";
import LoginDialog from "./pages/LoginDialog";
import CommandPalette from "./components/CommandPalette";
import { useAuthStore } from "./stores/auth";
import { useMembershipStore } from "./stores/membership";
import { useTheme } from "./hooks/useTheme";
import { useKeyboard } from "./hooks/useKeyboard";
import Toaster from "./components/Toaster";

export default function App() {
  initUIRegistry();
  const { init, isLoggedIn, accountEpoch } = useAuthStore();
  const [ready, setReady] = useState(false);

  // Apply theme on mount and on change
  useTheme();

  // Global keyboard shortcuts (always available after init)
  const readyForUse = ready && isLoggedIn;
  useKeyboard(readyForUse);

  useEffect(() => {
    init().then(() => setReady(true));
  }, [init]);

  // 登录后/切账号后加载本地配额缓存（供配额展示与预检）
  useEffect(() => {
    if (ready && isLoggedIn) {
      void useMembershipStore.getState().loadQuotaCache();
    }
  }, [ready, isLoggedIn, accountEpoch]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background-primary)]">
        <div className="text-center">
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-[var(--background-modifier-border)] border-t-[var(--interactive-accent)] mx-auto" />
          <p className="text-sm text-[var(--text-muted)]">
            MemFlow 加载中...
          </p>
        </div>
      </div>
    );
  }

  // 登录门槛：未登录时全屏登录页（云端为唯一数据源，无离线模式）
  if (!isLoggedIn) {
    return (
      <>
        <Login />
        <Toaster />
      </>
    );
  }

  return (
    <HashRouter>
      <CommandPalette />
      {/* Login dialog — 用于微信登录后的绑定邮箱流程、账号菜单"添加账号" */}
      <LoginDialog />
      {/* accountEpoch 变化（登录/切账号）强制路由整树重挂载，
          各页面 mount 时自然重新拉取当前账号数据 */}
      <Fragment key={accountEpoch}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Review />} />
            <Route path="/decks" element={<DeckList />} />
            <Route path="/decks/:id" element={<DeckDetail />} />
            <Route path="/stats" element={<PluginRoute route="/stats"><Stats /></PluginRoute>} />
            <Route path="/settings" element={<ReviewSettings />} />
            <Route path="/plugins" element={<PluginsPage />} />
            <Route path="/membership" element={<PluginRoute route="/membership"><Membership /></PluginRoute>} />
            <Route path="/market" element={<PluginRoute route="/market"><Market /></PluginRoute>} />
            <Route path="/wallet" element={<PluginRoute route="/wallet"><Wallet /></PluginRoute>} />
          </Route>
        </Routes>
      </Fragment>
      {/* Toast notifications */}
      <Toaster />
    </HashRouter>
  );
}
