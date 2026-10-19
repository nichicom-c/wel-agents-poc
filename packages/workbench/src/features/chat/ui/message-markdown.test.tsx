import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MessageMarkdown } from "./message-markdown.tsx";

function renderMarkdown(text: string): string {
  return renderToStaticMarkup(<MessageMarkdown text={text} />);
}

describe("MessageMarkdown", () => {
  // CommonMark は閉じ側の `**` が「約物の直後かつ文字の直前」だと強調を閉じない。
  // 日本語の LLM 出力はこの形になりやすく、実際に不足確認チャットで `**` が
  // そのまま表示された。`remark-cjk-friendly` が入っていないとこのテストが落ちる。
  test.each([
    ["ただ、**A（アセスメント）**がまだない状態です。", "A（アセスメント）"],
    ["**S（主観的情報）**は書けています", "S（主観的情報）"],
    ["これは**強調**です", "強調"],
  ])("日本語の約物をまたぐ強調を閉じる: %s", (input, expected) => {
    const html = renderMarkdown(input);
    expect(html).toContain(`<strong>${expected}</strong>`);
    expect(html).not.toContain("**");
  });

  test("基本 Markdown を semantic elements として描画する", () => {
    const html = renderMarkdown(`# 見出し

本文の **強調** と \`inline\`。

- item

\`\`\`ts
const value = 1;
\`\`\`
`);

    expect(html).toContain('class="message-markdown"');
    expect(html).toContain("<h1>見出し</h1>");
    expect(html).toContain("<strong>強調</strong>");
    expect(html).toContain("<code>inline</code>");
    expect(html).toContain("<li>item</li>");
    expect(html).toContain("<pre><code");
  });

  test("GFM table と strikethrough を描画する", () => {
    const html = renderMarkdown(`| 列A | 列B |
| --- | --- |
| 1 | ~~削除~~ |
`);

    expect(html).toContain("<table>");
    expect(html).toContain("<th>列A</th>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<del>削除</del>");
  });

  test("raw HTML を DOM element 化しない", () => {
    const html = renderMarkdown(`<script>alert(1)</script>

<div>raw html</div>
`);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<div>raw html</div>");
  });

  test("link に安全な navigation attribute を付ける", () => {
    const html = renderMarkdown("[公式](https://example.com/docs)");

    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("Markdown image は描画しない", () => {
    const html = renderMarkdown("![追跡画像](https://example.com/pixel.png)");

    expect(html).not.toContain("<img");
    expect(html).toContain("追跡画像");
  });
});
