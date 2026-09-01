import { create } from "zustand";

/* ── Helpers: localStorage persistence ─── */
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ── Types ─────────────────────────────── */
export type SidebarTab = "decks" | "search";
export type RightTab = "info" | "stats";
export type Theme = "dark" | "light";
export type CardViewMode = "list" | "grid";

interface UIState {
  /* Sidebar visibility */
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;

  /* Active tabs */
  leftTab: SidebarTab;
  rightTab: RightTab;

  /* Theme */
  theme: Theme;

  /* Card list view mode (deck detail) */
  cardViewMode: CardViewMode;

  /* Command palette */
  commandPaletteOpen: boolean;

  /* Actions */
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftTab: (tab: SidebarTab) => void;
  setRightTab: (tab: RightTab) => void;
  setTheme: (theme: Theme) => void;
  setCardViewMode: (mode: CardViewMode) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

/* ── Store ──────────────────────────────── */
export const useUIStore = create<UIState>()((set) => ({
  leftSidebarOpen: load("memflow_left_sidebar_open", true),
  rightSidebarOpen: load("memflow_right_sidebar_open", false),
  leftTab: load("memflow_left_tab", "decks" as SidebarTab),
  rightTab: load("memflow_right_tab", "info" as RightTab),
  theme: load("memflow_theme", "dark" as Theme),
  cardViewMode: load("memflow_card_view_mode", "grid" as CardViewMode),
  commandPaletteOpen: false,

  toggleLeftSidebar: () =>
    set((s) => {
      const v = !s.leftSidebarOpen;
      save("memflow_left_sidebar_open", v);
      return { leftSidebarOpen: v };
    }),

  toggleRightSidebar: () =>
    set((s) => {
      const v = !s.rightSidebarOpen;
      save("memflow_right_sidebar_open", v);
      return { rightSidebarOpen: v };
    }),

  setLeftTab: (tab) => {
    save("memflow_left_tab", tab);
    set({ leftTab: tab });
  },

  setRightTab: (tab) => {
    save("memflow_right_tab", tab);
    set({ rightTab: tab });
  },

  setTheme: (theme) => {
    save("memflow_theme", theme);
    set({ theme });
  },

  setCardViewMode: (mode) => {
    save("memflow_card_view_mode", mode);
    set({ cardViewMode: mode });
  },

  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
