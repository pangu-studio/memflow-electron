import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownViewProps {
  content: string;
  className?: string;
}

/**
 * Renders Markdown card content (used when viewing/reviewing cards).
 * GitHub-flavored Markdown (tables, strikethrough, task lists, autolinks) is
 * enabled via remark-gfm. Raw HTML is intentionally not rendered.
 * 公式渲染与小程序端对齐：$...$ 行内公式、$$...$$ 块级公式（KaTeX）。
 */
export default function MarkdownView({
  content,
  className = "",
}: MarkdownViewProps) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content ?? ""}
      </ReactMarkdown>
    </div>
  );
}
