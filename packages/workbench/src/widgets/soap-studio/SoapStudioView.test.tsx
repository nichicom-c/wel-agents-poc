import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SoapStudioView } from "./SoapStudioView.tsx";

describe("SoapStudioView", () => {
  test("見出しと SOAP 下書き生成フォームを描画する", () => {
    const html = renderToStaticMarkup(<SoapStudioView />);

    expect(html).toContain("SOAP Studio");
    expect(html).toContain("SOAP 下書き生成");
    expect(html).toContain("入力素材テキスト");
  });

  test("入力テキストが空のときは解析ボタンを disabled にする", () => {
    const html = renderToStaticMarkup(<SoapStudioView />);

    expect(html).toContain("解析");
    expect(html).toContain("disabled");
  });

  test("結果セクションは候補が無い初期状態では描画しない", () => {
    const html = renderToStaticMarkup(<SoapStudioView />);

    expect(html).not.toContain("SOAP 下書き候補");
  });

  test("記録種別は分類前の入力ではなく、分析結果全体への反映候補としてのみ扱う", () => {
    const html = renderToStaticMarkup(<SoapStudioView />);

    // 分類前のフォームに記録種別セレクタは存在しない（候補が無いので反映候補チェックボックスも未描画）。
    expect(html).not.toContain("記録種別");
  });

  test("候補が無い初期状態では不足確認セクションを描画しない", () => {
    const html = renderToStaticMarkup(<SoapStudioView />);

    expect(html).not.toContain("soap-gaps-section");
    expect(html).not.toContain("不足をチャットで確認");
  });

  test("候補が無い初期状態では正式記録として保存セクションを描画しない", () => {
    const html = renderToStaticMarkup(<SoapStudioView />);

    expect(html).not.toContain("soap-save-record-section");
    expect(html).not.toContain("正式記録として保存");
  });
});
