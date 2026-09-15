import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * アシスタントの発言を Markdown として描画する。`packages/chat-ui` の
 * `features/chat-stream/ui/message-markdown.tsx` と同じ方針（react-markdown + remark-gfm、
 * リンクは新規タブ、画像は URL を出さず alt テキストのみ表示）。
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
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
