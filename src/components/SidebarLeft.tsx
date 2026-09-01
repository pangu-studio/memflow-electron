import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { useUIStore } from "../stores/ui";
import { useAuthStore } from "../stores/auth";
import { useCardsStore } from "../stores/cards";
import { useTagsStore } from "../stores/tags";
import { useToastStore } from "../stores/toast";
import DeckTree from "./DeckTree";
import CliSettingsDialog from "./CliSettingsDialog";

export default function SidebarLeft() {
  const { leftTab, setLeftTab } = useUIStore();
  const { user, logout, accounts, switching, switchAccount, removeAccount, openLoginDialog } =
    useAuthStore();

  // 用户菜单（原顶栏右上角菜单，全屏时顶栏隐藏故移到此处；悬停弹出）
  const [showUserMenu, setShowUserMenu] = useState(false);
  // 命令行工具安装对话框
  const [showCliDialog, setShowCliDialog] = useState(false);
  // 账号移除的行内确认（两次点击：× → 确认）
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { searchResults, searchCards, clearSearch } = useCardsStore();
  const { tags: allTags, loadTags } = useTagsStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();

  // 进入搜索 tab 时加载标签候选
  useEffect(() => {
    if (leftTab === "search") loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftTab]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim() && selectedTags.length === 0) {
      clearSearch();
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchCards(searchQuery.trim(), selectedTags);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, selectedTags]);

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  return (
    <aside className="flex flex-col w-[260px] h-full bg-[var(--background-secondary)] border-r border-[var(--background-modifier-border)]">
      {/* ── Tabs ────────────────────────── */}
      <Tabs.Root
        value={leftTab}
        onValueChange={(v) => setLeftTab(v as "decks" | "search")}
        className="flex-1 flex flex-col min-h-0"
      >
        <Tabs.List className="flex border-b border-[var(--background-modifier-border)] px-2">
          <Tabs.Trigger
            value="decks"
            className="flex-1 px-3 py-2 text-sm font-medium rounded-t
                       text-[var(--text-muted)]
                       data-[state=active]:text-[var(--text-normal)]
                       data-[state=active]:border-b-2 data-[state=active]:border-[var(--text-accent)]
                       hover:bg-[var(--background-modifier-hover)]
                       transition-colors"
          >
            牌组
          </Tabs.Trigger>
          <Tabs.Trigger
            value="search"
            className="flex-1 px-3 py-2 text-sm font-medium rounded-t
                       text-[var(--text-muted)]
                       data-[state=active]:text-[var(--text-normal)]
                       data-[state=active]:border-b-2 data-[state=active]:border-[var(--text-accent)]
                       hover:bg-[var(--background-modifier-hover)]
                       transition-colors"
          >
            搜索
          </Tabs.Trigger>
        </Tabs.List>

        {/* Decks tab */}
        <Tabs.Content
          value="decks"
          forceMount
          className="flex-1 flex flex-col overflow-y-auto data-[state=inactive]:hidden"
        >
          <DeckTree />
        </Tabs.Content>

        {/* Search tab */}
        <Tabs.Content
          value="search"
          forceMount
          className="flex-1 flex flex-col data-[state=inactive]:hidden pt-3 px-3 min-h-0"
        >
          <div className="relative shrink-0">
            <input
              type="text"
              placeholder="搜索卡片内容..."
              className="w-full px-3 py-1.5 pr-8 rounded-md text-sm
                         bg-[var(--background-primary)]
                         text-[var(--text-normal)]
                         placeholder:text-[var(--text-faint)]
                         border border-[var(--background-modifier-border)]
                         focus:outline-none focus:border-[var(--interactive-accent)]
                         transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center
                           w-5 h-5 rounded-md text-[var(--text-faint)]
                           hover:bg-[var(--background-modifier-hover)]
                           hover:text-[var(--text-normal)] transition-colors"
              >
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="shrink-0 mt-2 flex flex-wrap gap-1.5">
              {allTags.map((t) => {
                const active = selectedTags.includes(t.name);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.name)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      active
                        ? "border-[var(--interactive-accent)] bg-[var(--interactive-accent)] text-[var(--text-on-accent)]"
                        : "border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:border-[var(--interactive-accent)] hover:text-[var(--text-normal)]"
                    }`}
                  >
                    #{t.name}
                    <span className={active ? "ml-1 opacity-80" : "ml-1 text-[var(--text-faint)]"}>
                      {t.card_count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search results */}
          <div className="flex-1 overflow-y-auto mt-2 min-h-0">
            {!searchQuery.trim() && selectedTags.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <p className="text-sm text-[var(--text-faint)]">输入关键词或选择标签搜索</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <p className="text-sm text-[var(--text-faint)]">无匹配结果</p>
              </div>
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left p-2.5 rounded-lg mb-1 text-sm
                             hover:bg-[var(--background-modifier-hover)] transition-colors"
                  onClick={() => {
                    navigate(`/decks/${r.deck_id}`);
                    // Defer the focus until the deck's cards load in DeckDetail,
                    // which then filters the list to just this card.
                    useCardsStore.getState().requestFocusCard(r.id);
                    // Surface the card's properties in the right panel.
                    const ui = useUIStore.getState();
                    ui.setRightTab("info");
                    if (!ui.rightSidebarOpen) ui.toggleRightSidebar();
                  }}
                >
                  <p className="text-[var(--text-normal)] truncate font-medium">
                    {r.front}
                  </p>
                  <p className="text-xs text-[var(--text-faint)] truncate mt-0.5">
                    {r.deck_name}
                    {(r.tags ?? []).length > 0 && (
                      <span className="ml-1.5">
                        {(r.tags ?? []).map((t) => `#${t}`).join(" ")}
                      </span>
                    )}
                  </p>
                </button>
              ))
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>

      {/* ── User info + menu (bottom) ──────────── */}
      <div
        className="relative border-t border-[var(--background-modifier-border)] p-3"
        onMouseEnter={() => setShowUserMenu(true)}
        onMouseLeave={() => setShowUserMenu(false)}
      >
        {user && (
          <>
            <div className="w-full flex items-center gap-2.5 rounded-md px-1 py-0.5">
              {/* Avatar */}
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--interactive-accent)] text-[11px] font-semibold text-[var(--text-on-accent)] shrink-0">
                {(user.nickname || user.email || "U")[0].toUpperCase()}
              </div>
              {/* Name + login type */}
              <div className="flex-1 min-w-0 text-left">
                <p className="truncate text-sm text-[var(--text-normal)]">
                  {user.nickname || user.email || "用户"}
                </p>
                <p className="truncate text-xs text-[var(--text-faint)]">
                  {user.login_type === "wechat"
                    ? "微信登录"
                    : user.login_type === "both"
                      ? "邮箱+微信"
                      : "邮箱登录"}
                </p>
              </div>
            </div>

            {/* 悬停弹出的账号菜单（向上）；外层 pb-1 透明桥接，鼠标移过间隙不关闭 */}
            {showUserMenu && (
              <div className="absolute left-3 right-3 bottom-full pb-1 z-50">
                <div
                  className="rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] shadow-lg py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate("/market");
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-normal)] transition-colors"
                >
                  卡片市场
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate("/wallet");
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-normal)] transition-colors"
                >
                  灵光点钱包
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate("/membership");
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-normal)] transition-colors"
                >
                  会员中心
                </button>
                <div className="my-1 border-t border-[var(--background-modifier-border)]" />
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowCliDialog(true);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-normal)] transition-colors"
                >
                  命令行工具
                </button>
                <div className="my-1 border-t border-[var(--background-modifier-border)]" />
                {/* ── 多账号切换区 ── */}
                <p className="px-3 pt-1 pb-0.5 text-xs text-[var(--text-faint)]">切换账号</p>
                <div className="max-h-40 overflow-y-auto">
                  {accounts.map((a) => (
                    <div
                      key={a.key}
                      className="group relative flex items-center rounded-sm hover:bg-[var(--background-modifier-hover)] transition-colors"
                    >
                      <button
                        disabled={switching || a.is_current}
                        onClick={() => {
                          if (!a.is_current_env) {
                            useToastStore
                              .getState()
                              .addToast("info", `该账号属于 ${a.env} 环境，切换环境后可用`);
                            return;
                          }
                          setShowUserMenu(false);
                          void switchAccount(a.key);
                        }}
                        className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                          a.is_current
                            ? "text-[var(--text-normal)]"
                            : a.is_current_env
                              ? "text-[var(--text-muted)] hover:text-[var(--text-normal)]"
                              : "text-[var(--text-faint)]"
                        } disabled:cursor-default`}
                      >
                        <span className="w-3.5 shrink-0 text-xs text-[var(--interactive-accent)]">
                          {a.is_current ? "✓" : ""}
                        </span>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--interactive-accent)] text-[9px] font-semibold text-[var(--text-on-accent)]">
                          {(a.nickname || a.email || "U")[0].toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">
                            {a.nickname || a.email || "用户"}
                            {!a.is_current_env && (
                              <span className="ml-1 text-[10px] text-[var(--text-faint)]">
                                {a.env}
                              </span>
                            )}
                          </span>
                        </span>
                        {switching && !a.is_current && (
                          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[var(--background-modifier-border)] border-t-[var(--interactive-accent)]" />
                        )}
                      </button>
                      {/* 移除（非当前账号；行内两步确认）。其离线评分队列保留，重新登录可续传 */}
                      {!a.is_current && (
                        confirmingKey === a.key ? (
                          <button
                            onClick={() => {
                              setConfirmingKey(null);
                              void removeAccount(a.key);
                            }}
                            onMouseLeave={() => setConfirmingKey(null)}
                            className="shrink-0 mr-2 px-1.5 py-0.5 rounded text-[10px] text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                          >
                            确认移除
                          </button>
                        ) : (
                          <button
                            aria-label="移除账号"
                            onClick={() => setConfirmingKey(a.key)}
                            className="shrink-0 mr-2 hidden group-hover:flex h-4 w-4 items-center justify-center rounded text-xs text-[var(--text-faint)] hover:text-red-400 transition-colors"
                          >
                            ×
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    openLoginDialog("addAccount");
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-normal)] transition-colors"
                >
                  ＋ 添加账号
                </button>
                <div className="my-1 border-t border-[var(--background-modifier-border)]" />
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    void logout();
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-[var(--background-modifier-hover)] transition-colors"
                >
                  退出登录
                </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 命令行工具安装对话框 */}
      <CliSettingsDialog open={showCliDialog} onOpenChange={setShowCliDialog} />
    </aside>
  );
}
