import { useRef } from "react";
import MarkdownView from "./MarkdownView";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: number;
  id?: string;
  /** 预览前对源文本做变换（如挖空卡的 maskCloze/revealCloze），不改动编辑内容 */
  previewTransform?: (value: string) => string;
}

type ToolbarItem = {
  title: string;
  label: string;
  bold?: boolean;
  italic?: boolean;
  run: () => void;
};

/**
 * Lightweight split Markdown editor: a compact toolbar + a textarea (source)
 * next to a live react-markdown preview. Side-by-side on `sm+` screens,
 * stacked on narrow ones. No heavy WYSIWYG dependency — React-19 safe.
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder = "支持 Markdown：**加粗** · `代码` · > 引用 · - 列表 · $公式$ …",
  autoFocus = false,
  minHeight = 168,
  id,
  previewTransform,
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /** Apply a transformation to the current selection, then restore focus/caret. */
  function apply(transform: (selected: string) => string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);
    const inserted = transform(selected);
    onChange(before + inserted + after);
    // Restore selection after React writes the new value back to the textarea.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start, start + inserted.length);
    });
  }

  function wrap(prefix: string, suffix = prefix, sample = "文本") {
    apply((sel) => `${prefix}${sel || sample}${suffix}`);
  }

  function prefixLines(prefix: string, sample = "列表项") {
    apply((sel) =>
      (sel || sample)
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n")
    );
  }

  const toolbar: ToolbarItem[] = [
    { title: "标题", label: "H", run: () => prefixLines("## ", "标题") },
    { title: "加粗", label: "B", bold: true, run: () => wrap("**", "**", "加粗") },
    { title: "斜体", label: "I", italic: true, run: () => wrap("*", "*", "斜体") },
    { title: "行内代码", label: "</>", run: () => wrap("`", "`", "code") },
    { title: "代码块", label: "```", run: () => wrap("\n```\n", "\n```\n", "代码") },
    { title: "行内公式", label: "∑", run: () => wrap("$", "$", "E=mc^2") },
    { title: "块级公式", label: "∑∑", run: () => wrap("\n$$\n", "\n$$\n", "公式") },
    { title: "无序列表", label: "•", run: () => prefixLines("- ") },
    { title: "有序列表", label: "1.", run: () => prefixLines("1. ") },
    { title: "引用", label: "❝", run: () => prefixLines("> ", "引用") },
    { title: "链接", label: "🔗", run: () => wrap("[", "](https://)", "链接文字") },
    { title: "图片", label: "🖼", run: () => wrap("![", "](https://)", "图片说明") },
  ];

  return (
    <div className="rounded-lg border border-[var(--background-modifier-border)] overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 bg-[var(--background-modifier-hover)] border-b border-[var(--background-modifier-border)]">
        {toolbar.map((item) => (
          <button
            key={item.title}
            type="button"
            title={item.title}
            onClick={item.run}
            className={[
              "px-1.5 h-6 min-w-[24px] rounded text-xs font-mono",
              "text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-active)]",
              item.bold ? "font-bold" : "",
              item.italic ? "italic" : "",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* split: source (left) | live preview (right) */}
      <div className="flex flex-col sm:flex-row">
        <textarea
          ref={ref}
          id={id}
          spellCheck={false}
          className="w-full sm:flex-1 px-3 py-2 bg-[var(--background-primary)] text-[var(--text-normal)] text-sm font-mono leading-relaxed resize-none focus:outline-none border-0"
          style={{ minHeight }}
          placeholder={placeholder}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
        <div
          className="w-full sm:flex-1 sm:border-l border-t sm:border-t-0 border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 overflow-auto"
          style={{ minHeight }}
        >
          {value.trim() ? (
            <MarkdownView content={previewTransform ? previewTransform(value) : value} />
          ) : (
            <span className="text-sm text-[var(--text-faint)]">
              实时预览
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
