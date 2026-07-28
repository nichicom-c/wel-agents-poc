import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { VoiceCaptureView } from "./VoiceCaptureView.tsx";

describe("VoiceCaptureView", () => {
  test("見出しと録音/アップロード操作を描画する", () => {
    const html = renderToStaticMarkup(
      <VoiceCaptureView onSendToSoapStudio={() => {}} />,
    );

    expect(html).toContain("Voice Capture");
    expect(html).toContain("録音開始");
    expect(html).toContain("音声ファイルを選択");
    expect(html).toContain("状態: 未録音");
  });

  test("初期状態では文字起こし結果セクションを描画しない", () => {
    const html = renderToStaticMarkup(
      <VoiceCaptureView onSendToSoapStudio={() => {}} />,
    );

    expect(html).not.toContain("文字起こし結果（編集可）");
    expect(html).not.toContain("手動でテキストを入力してください");
  });

  test("初期状態ではアップロードボタンを disabled にする", () => {
    const html = renderToStaticMarkup(
      <VoiceCaptureView onSendToSoapStudio={() => {}} />,
    );

    expect(html).toContain("アップロードして文字起こし開始");
    expect(html).toContain("disabled");
  });

  test("navigator が無い環境（SSR/テスト）では録音ボタンを disabled にし案内文を出す", () => {
    const html = renderToStaticMarkup(
      <VoiceCaptureView onSendToSoapStudio={() => {}} />,
    );

    expect(html).toContain("この接続では録音を利用できません");
  });
});
