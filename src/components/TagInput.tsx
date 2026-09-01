import { useEffect, useMemo, useState } from "react";
import { useTagsStore } from "../stores/tags";

const MAX_TAGS_PER_CARD = 10;
const MAX_TAG_NAME_LEN = 30;

/** 与云端 normalizeTagName 对齐：去首尾空白、内部连续空白折叠为一个空格 */
function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * 标签 chips 输入框：回车/逗号成签，Backspace 删最后一个；
 * 输入时从用户已有标签中过滤出候选（点击补全）。
 * 名称规范化在本地与云端各做一次，保持一致。
 */
export default function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const { tags: allTags, loadTags } = useTagsStore();

  useEffect(() => {
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = useMemo(() => {
    const q = normalizeTagName(input).toLowerCase();
    if (!q) return [];
    return allTags
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) &&
          !value.some((v) => v === t.name)
      )
      .slice(0, 6);
  }, [input, allTags, value]);

  function addTag(raw: string) {
    const name = normalizeTagName(raw);
    setError("");
    if (!name) return;
    if (Array.from(name).length > MAX_TAG_NAME_LEN) {
      setError(`标签名最多 ${MAX_TAG_NAME_LEN} 字符`);
      return;
    }
    if (value.includes(name)) {
      setInput("");
      return;
    }
    if (value.length >= MAX_TAGS_PER_CARD) {
      setError(`单张卡片最多 ${MAX_TAGS_PER_CARD} 个标签`);
      return;
    }
    onChange([...value, name]);
    setInput("");
  }

  function removeTag(name: string) {
    setError("");
    onChange(value.filter((t) => t !== name));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--background-primary)] border border-[var(--background-modifier-border)] focus-within:ring-1 focus-within:ring-[var(--interactive-accent)]">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--background-modifier-hover)] text-[var(--text-normal)]"
          >
            {t}
            <button
              type="button"
              className="text-[var(--text-faint)] hover:text-red-400 transition-colors"
              onClick={() => removeTag(t)}
              title="移除标签"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[120px] bg-transparent text-sm text-[var(--text-normal)] focus:outline-none py-0.5"
          placeholder={
            value.length === 0 ? "输入标签，回车添加（最多 10 个）" : ""
          }
          value={input}
          onChange={(e) => {
            const v = e.target.value;
            // 逗号（中英文）直接成签
            if (/[,，]$/.test(v)) {
              addTag(v.slice(0, -1));
              return;
            }
            setInput(v);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(input);
            } else if (e.key === "Backspace" && !input && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          onBlur={() => {
            if (input.trim()) addTag(input);
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              className="text-xs px-2 py-0.5 rounded-full border border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:border-[var(--interactive-accent)] hover:text-[var(--text-normal)] transition-colors"
              onClick={() => addTag(t.name)}
            >
              {t.name}
              <span className="ml-1 text-[var(--text-faint)]">
                {t.card_count}
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
