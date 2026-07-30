import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TrainingView } from "./TrainingView.tsx";

describe("TrainingView", () => {
  test("見出しとロール切り替え、既定ロール（新人保健師）での演習/学習履歴タブを描画する", () => {
    const html = renderToStaticMarkup(<TrainingView />);

    expect(html).toContain("Training");
    expect(html).toContain("ロール（デモ用の切り替え");
    expect(html).toContain("演習");
    expect(html).toContain("学習履歴");
  });

  test("既定ロール（新人保健師）では権限がありませんの表示をしない", () => {
    const html = renderToStaticMarkup(<TrainingView />);

    expect(html).not.toContain("この画面を利用する権限がありません");
  });
});
