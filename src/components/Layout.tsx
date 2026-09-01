import { Outlet } from "react-router-dom";
import { useUIStore } from "../stores/ui";
import TopBar from "./TopBar";
import SidebarLeft from "./SidebarLeft";
import SidebarRight from "./SidebarRight";

export default function Layout() {
  const {
    leftSidebarOpen,
    rightSidebarOpen,
    toggleLeftSidebar,
    toggleRightSidebar,
  } = useUIStore();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top bar ─────────────────────── */}
      <TopBar />

      {/* ── Content row ─────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        {leftSidebarOpen ? (
          <SidebarLeft />
        ) : (
          /* Collapsed strip */
          <div className="flex flex-col items-center w-9 shrink-0 bg-[var(--background-secondary)] border-r border-[var(--background-modifier-border)] pt-2">
            <button
              onClick={toggleLeftSidebar}
              className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
              aria-label="展开侧栏"
              title="展开侧栏 (⌘B)"
            >
              <ChevronRight />
            </button>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-auto bg-[var(--background-primary)]">
          <Outlet />
        </main>

        {/* Right sidebar */}
        {rightSidebarOpen ? (
          <SidebarRight />
        ) : (
          /* Collapsed strip */
          <div className="flex flex-col items-center w-9 shrink-0 bg-[var(--background-secondary)] border-l border-[var(--background-modifier-border)] pt-2">
            <button
              onClick={toggleRightSidebar}
              className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
              aria-label="展开右侧栏"
              title="展开右侧栏 (⌘⇧B)"
            >
              <ChevronLeft />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small chevron icons (reused for strip buttons) ── */

function ChevronLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
