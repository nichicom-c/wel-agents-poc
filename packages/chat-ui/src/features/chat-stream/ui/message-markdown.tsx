import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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
