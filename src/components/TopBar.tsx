import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUIStore } from "../stores/ui";
import { getCurrentWindow } from "@/lib/window";

export default function TopBar() {
  const {
    leftSidebarOpen,
    rightSidebarOpen,
    toggleLeftSidebar,
    toggleRightSidebar,
  } = useUIStore();
  const navigate = useNavigate();
  const location = useLocation();

  const isReviewActive = location.pathname === "/";

  /* ── Fullscreen state ──────────────── */
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;

    const sync = () => {
      if (cancelled) return;
      win.isFullscreen().then((fs) => {
        if (cancelled) return;
        setIsFullscreen(fs);
        document.documentElement.setAttribute("data-fullscreen", String(fs));
      });
    };

    sync();
    const unlisten = win.onResized(sync);
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, []);

  // Hide custom titlebar during fullscreen
  // NOTE: must be after all hooks to satisfy Rules of Hooks
  const fullscreenStyle = isFullscreen ? { display: "none" } : undefined;

  // Listen for keyboard shortcut navigation (⌘R → /)
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail as string;
      navigate(path);
    };
    window.addEventListener("memflow:navigate", handler);
    return () => window.removeEventListener("memflow:navigate", handler);
  }, [navigate]);

  return (
    <div
      data-tauri-drag-region
      className="flex items-center h-9 shrink-0 bg-[var(--background-secondary)] border-b border-[var(--background-modifier-border)] pl-[80px] pr-3 select-none titlebar"
      style={fullscreenStyle}
    >
      {/* ── Left sidebar toggle ────────── */}
      <button
        onClick={toggleLeftSidebar}
        className={`p-1 rounded cursor-pointer no-drag transition-colors ${
          leftSidebarOpen
            ? "text-[var(--text-normal)] bg-[var(--background-modifier-active)]"
            : "text-[var(--text-faint)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
        }`}
        aria-label={leftSidebarOpen ? "关闭侧栏" : "展开侧栏"}
        title={`${leftSidebarOpen ? "关闭" : "展开"}侧栏 (⌘B)`}
      >
        <SidebarLeftIcon />
      </button>

      {/* ── Start Review button ──────── */}
      <button
        onClick={() => navigate("/")}
        className={`ml-2 px-3 py-1 rounded-md text-sm font-medium no-drag cursor-pointer transition-colors ${
          isReviewActive
            ? "bg-[var(--interactive-accent)] text-[var(--text-on-accent)]"
            : "text-[var(--text-accent)] hover:bg-[var(--interactive-accent-hover)]"
        }`}
        title="开始复习 (⌘R)"
      >
        <span className="flex items-center gap-1.5">
          <ReviewIcon />
          开始复习
        </span>
      </button>

      {/* ── Spacer ──────────────────────── */}
      <div className="flex-1 no-drag" />

      {/* ── Right side: right sidebar toggle ──
          （用户菜单已移至左侧栏底部，全屏时顶栏隐藏也不受影响） */}
      <div className="flex items-center gap-2 no-drag">
        <button
          onClick={toggleRightSidebar}
          className={`p-1 rounded cursor-pointer no-drag transition-colors ${
            rightSidebarOpen
              ? "text-[var(--text-normal)] bg-[var(--background-modifier-active)]"
              : "text-[var(--text-faint)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
          }`}
          aria-label={rightSidebarOpen ? "关闭面板" : "展开面板"}
          title={`${rightSidebarOpen ? "关闭" : "展开"}面板 (⌘⇧B)`}
        >
          <SidebarRightIcon />
        </button>
      </div>
    </div>
  );
}

/* ── Sidebar toggle icons ───────────────────── */

function SidebarLeftIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="6" y1="7" x2="6" y2="7.01" />
      <line x1="6" y1="11" x2="6" y2="11.01" />
      <line x1="6" y1="15" x2="6" y2="15.01" />
    </svg>
  );
}

function SidebarRightIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
      <line x1="18" y1="7" x2="18" y2="7.01" />
      <line x1="18" y1="11" x2="18" y2="11.01" />
      <line x1="18" y1="15" x2="18" y2="15.01" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
