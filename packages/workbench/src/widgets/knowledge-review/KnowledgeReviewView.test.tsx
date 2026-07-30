import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { KnowledgeReviewView } from "./KnowledgeReviewView.tsx";

describe("KnowledgeReviewView", () => {
  test("見出しとロール切り替え、既定ロール（専門職）でのタブを描画する", () => {
    const html = renderToStaticMarkup(<KnowledgeReviewView />);

    expect(html).toContain("Knowledge Review");
    expect(html).toContain("ロール（デモ用の切り替え");
    expect(html).toContain("教材候補");
    expect(html).toContain("記録から探す");
  });

  test("既定ロール（専門職）では権限がありませんの表示をしない", () => {
    const html = renderToStaticMarkup(<KnowledgeReviewView />);

    expect(html).not.toContain("この画面を利用する権限がありません");
  });
});
