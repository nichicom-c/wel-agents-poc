import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminView } from "./AdminView.tsx";

describe("AdminView", () => {
  test("見出しとロール切り替え、既定ロール（管理者）でのタブを描画する", () => {
    const html = renderToStaticMarkup(<AdminView />);

    expect(html).toContain("Admin");
    expect(html).toContain("ロール（デモ用の切り替え");
    expect(html).toContain("教材");
    expect(html).toContain("ルーブリック");
    expect(html).toContain("SOAP マッピング");
  });

  test("既定ロール（管理者）では権限がありませんの表示をしない", () => {
    const html = renderToStaticMarkup(<AdminView />);

    expect(html).not.toContain("この画面を利用する権限がありません");
  });
});
