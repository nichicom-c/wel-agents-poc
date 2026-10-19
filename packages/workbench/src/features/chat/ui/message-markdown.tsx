import ReactMarkdown, { type Components } from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkGfm from "remark-gfm";

/**
 * アシスタントの発言を Markdown として描画する。`packages/chat-ui` の
 * `features/chat-stream/ui/message-markdown.tsx` と同じ方針（react-markdown + remark-gfm、
 * リンクは新規タブ、画像は URL を出さず alt テキストのみ表示）。
 *
 * `remark-cjk-friendly` は日本語のための追加。CommonMark は閉じ側の `**` が「約物の直後かつ
 * 文字の直前」だと強調を閉じないと決めており、`**A（アセスメント）**がまだない` のような
 * LLM の出力がそのまま `**` 付きで表示されてしまう。CJK 向けに flanking 規則を緩める。
 */

type MessageMarkdownProps = {
  text: string;
};

const components: Components = {
  a({ children, href, node: _node, ...props }) {
    return (
      <a {...props} href={href} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    );
  },
  img({ alt }) {
    return alt ? (
      <span className="message-markdown-image-alt">{alt}</span>
    ) : null;
  },
};

export function MessageMarkdown({ text }: MessageMarkdownProps) {
  return (
    <div className="message-markdown">
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm, remarkCjkFriendly]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
