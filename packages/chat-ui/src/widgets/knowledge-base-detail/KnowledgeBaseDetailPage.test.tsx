import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { KnowledgeBaseDetailPage } from "./KnowledgeBaseDetailPage.tsx";

function renderKnowledgeBaseDetailPage() {
  return renderToStaticMarkup(
    <KnowledgeBaseDetailPage
      accessToken="jwt-token"
      domain="medical_care_law"
      fetchFn={async () => Response.json({})}
      isEnvironmentPanelOpen={true}
      isSessionPanelOpen={true}
      onBack={() => undefined}
      onOpenEnvironmentPanel={() => undefined}
      onOpenSessionPanel={() => undefined}
    />,
  );
}

describe("KnowledgeBaseDetailPage", () => {
  test("中央カラムの詳細 page と主要操作を表示する", () => {
    const html = renderKnowledgeBaseDetailPage();

    expect(html).toContain('aria-label="Knowledge Base 詳細"');
    expect(html).toContain(">Knowledge Base<");
    expect(html).toContain(">KB medical<");
    expect(html).toContain('aria-label="チャットに戻る"');
    expect(html).toContain(">arrow_back<");
    expect(html).toContain(">refresh<");
    expect(html).toContain('aria-controls="session-panel"');
    expect(html).toContain('aria-controls="environment-panel"');
    expect(html.match(/aria-expanded="true"/g)?.length).toBe(2);
  });

  test("初期表示でも overview / documents / configuration の領域を持つ", () => {
    const html = renderKnowledgeBaseDetailPage();

    expect(html).toContain(">概要<");
    expect(html).toContain(">Data Sources<");
    expect(html).toContain(">Documents<");
    expect(html).toContain(">Configuration<");
    expect(html).toContain(">待機中<");
  });
});
