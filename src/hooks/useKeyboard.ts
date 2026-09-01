import { useEffect } from "react";
import { useUIStore } from "../stores/ui";

/**
 * Register global keyboard shortcuts.
 * Pass `enabled = false` to disable (e.g. before login).
 */
export function useKeyboard(enabled = true) {
  const { toggleCommandPalette, toggleLeftSidebar, toggleRightSidebar } =
    useUIStore();

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "p") {
        e.preventDefault();
        toggleCommandPalette();
      }
      if (mod && key === "r") {
        e.preventDefault();
        // 通过自定义事件让 TopBar 处理导航（保持 react-router 状态一致）
        window.dispatchEvent(new CustomEvent("memflow:navigate", { detail: "/" }));
      }
      // Shift variant must be checked before plain variant
      if (mod && e.shiftKey && key === "b") {
        e.preventDefault();
        toggleRightSidebar();
      } else if (mod && key === "b") {
        e.preventDefault();
        toggleLeftSidebar();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, toggleCommandPalette, toggleLeftSidebar, toggleRightSidebar]);
}
