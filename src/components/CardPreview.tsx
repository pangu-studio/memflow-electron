import { useState, useEffect, useCallback, useRef } from "react";
import MarkdownView from "./MarkdownView";
import { maskCloze, revealCloze } from "../utils/cloze";

interface CardPreviewProps {
  front: string;
  back: string;
  /** 受控翻面状态（复习页需要据此显示评分按钮） */
  flipped: boolean;
  onFlip: () => void;
  className?: string;
  /** 挖空卡当前复习的空号（cN）；缺省时遮蔽全部挖空（兼容旧行为） */
  clozeNum?: number;
}

/**
 * 复习样式的卡片展示：正面/背面标签、点击翻面、挖空遮蔽/揭示、
 * 长内容内部滚动 + 底部渐隐提示。复习页、卡片列表预览、编辑预览共用，
 * 保证各处卡片观感一致。
 */
export default function CardPreview({
  front,
  back,
  flipped,
  onFlip,
  className = "",
  clozeNum,
}: CardPreviewProps) {
  // 长内容滚动：卡片内部滚动，底部渐隐提示“还有更多内容”
  const contentRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const updateScrollState = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    updateScrollState();
    el.scrollTop = 0;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [front, back, flipped, updateScrollState]);

  return (
    <div
      className={`relative w-full min-h-[320px] max-h-[min(800px,calc(100vh-140px))]
                 rounded-2xl cursor-pointer select-none
                 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)]
                 hover:border-[var(--interactive-accent)] transition-colors
                 shadow-sm flex flex-col overflow-hidden ${className}`}
      onClick={onFlip}
    >
      {/* 正/背面标签 */}
      <span
        className={`absolute top-3 left-4 z-10 text-[10px] px-2 py-0.5 rounded-full
                    ${flipped
                      ? "bg-[var(--interactive-accent)] text-[var(--text-on-accent)]"
                      : "bg-[var(--background-modifier-hover)] text-[var(--text-faint)]"}`}
      >
        {flipped ? "背面" : "正面"}
      </span>

      {/* 可滚动内容区：短内容垂直居中（my-auto），长内容从顶部开始滚动。
          挖空卡与小程序端对齐：正面遮蔽 {{...}}，背面揭示（无背面内容时回退正面） */}
      <div
        ref={contentRef}
        onScroll={updateScrollState}
        className="flex-1 min-h-0 overflow-y-auto px-8 py-7 flex flex-col"
      >
        <div className="my-auto w-full">
          <MarkdownView
            content={flipped ? revealCloze(back || front) : maskCloze(front, clozeNum)}
            className="w-full text-left text-base"
          />
        </div>
      </div>

      {/* 底部渐隐：提示下方还有内容 */}
      {canScrollMore && (
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-[var(--background-secondary)] to-transparent flex items-end justify-center pb-1.5">
          <span className="text-[10px] text-[var(--text-faint)]">
            ↓ 滚动查看更多
          </span>
        </div>
      )}
    </div>
  );
}
