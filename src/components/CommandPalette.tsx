import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useUIStore } from "../stores/ui";
import { useAuthStore } from "../stores/auth";

export default function CommandPalette() {
  const navigate = useNavigate();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const { setTheme } = useUIStore();
  const { toggleLeftSidebar, toggleRightSidebar } = useUIStore();
  const logout = useAuthStore((s) => s.logout);

  const run = useCallback(
    (fn: () => void) => {
      setOpen(false);
      // Defer so the dialog close animation doesn't eat the navigation
      requestAnimationFrame(fn);
    },
    [setOpen],
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className="fixed top-[15%] left-1/2 z-50 w-[560px] max-h-[480px]
                     -translate-x-1/2 rounded-xl shadow-[var(--shadow-modal)]
                     bg-[var(--background-primary)]
                     border border-[var(--background-modifier-border)]
                     overflow-hidden"
        >
          <Command label="命令面板" shouldFilter={true}>
            {/* ── Search input ──────────────────── */}
            <div className="flex items-center border-b border-[var(--background-modifier-border)] px-3">
              <Command.Input
                placeholder="输入命令..."
                autoFocus
                className="flex-1 bg-transparent py-3 text-sm text-[var(--text-normal)]
                           placeholder:text-[var(--text-faint)] outline-none"
              />
              <kbd className="text-[10px] text-[var(--text-faint)] tracking-wide">
                ESC
              </kbd>
            </div>

            {/* ── Results ──────────────────────── */}
            <Command.List className="py-2 overflow-y-auto max-h-[400px]">
              <Command.Empty className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                未找到匹配命令
              </Command.Empty>

              {/* Navigation */}
              <CmdGroup heading="导航">
                <CmdItem
                  icon="📝"
                  label="前往复习"
                  shortcut="⌘1"
                  onSelect={() => run(() => navigate("/"))}
                />
                <CmdItem
                  icon="📁"
                  label="前往牌组"
                  shortcut="⌘2"
                  onSelect={() => run(() => navigate("/decks"))}
                />
                <CmdItem
                  icon="📊"
                  label="前往统计"
                  shortcut="⌘3"
                  onSelect={() => run(() => navigate("/stats"))}
                />
                <CmdItem
                  icon="⚙️"
                  label="复习设置"
                  shortcut="⌘4"
                  onSelect={() => run(() => navigate("/settings"))}
                />
                <CmdItem
                  icon="👑"
                  label="会员中心"
                  onSelect={() => run(() => navigate("/membership"))}
                />
              </CmdGroup>

              {/* View */}
              <CmdGroup heading="视图">
                <CmdItem
                  icon="◧"
                  label="切换左侧栏"
                  shortcut="⌘B"
                  onSelect={() => run(toggleLeftSidebar)}
                />
                <CmdItem
                  icon="◨"
                  label="切换右侧栏"
                  shortcut="⌘⇧B"
                  onSelect={() => run(toggleRightSidebar)}
                />
                <CmdItem
                  icon="🌗"
                  label="切换深浅色主题"
                  onSelect={() =>
                    run(() => {
                      const current = useUIStore.getState().theme;
                      setTheme(current === "dark" ? "light" : "dark");
                    })
                  }
                />
              </CmdGroup>

              {/* Account */}
              <CmdGroup heading="账户">
                <CmdItem
                  icon="🚪"
                  label="退出登录"
                  onSelect={() => run(logout)}
                />
              </CmdGroup>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ── Sub-components ─────────────────────── */

function CmdGroup({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5
                 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold
                 [&_[cmdk-group-heading]]:text-[var(--text-faint)]
                 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
    >
      {children}
    </Command.Group>
  );
}

function CmdItem({
  icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 mx-1 px-3 py-2 rounded-md text-sm
                 text-[var(--text-normal)]
                 aria-selected:bg-[var(--background-modifier-hover)]
                 cursor-pointer"
    >
      <span className="text-base w-5 text-center shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="text-[10px] text-[var(--text-faint)] tracking-wide">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
