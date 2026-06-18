import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ChatSessionRecord } from "../../features/session-history/index.ts";
import { SessionRail } from "./SessionRail.tsx";

const SESSIONS: ChatSessionRecord[] = [
  {
    conversationId: "chat-a",
    createdAt: "2026-06-18T00:00:00.000Z",
    messageCount: 2,
    messages: [],
    preview: "回答待ち",
    title: "Session A",
    updatedAt: "2026-06-18T00:00:00.000Z",
  },
  {
    conversationId: "chat-b",
    createdAt: "2026-06-18T01:00:00.000Z",
    messageCount: 0,
    messages: [],
    preview: "会話はまだありません",
    title: "Session B",
    updatedAt: "2026-06-18T01:00:00.000Z",
  },
];

describe("SessionRail", () => {
  test("processing session を badge 表示しつつ inactive session は選択可能にする", () => {
    const html = renderToStaticMarkup(
      <SessionRail
        activeConversationId="chat-b"
        canRefreshSessions={true}
        isCollapsed={false}
        isOverlayOpen={false}
        onClose={() => undefined}
        onToggleCollapsed={() => undefined}
        onNewSession={() => undefined}
        onRefreshSessions={() => undefined}
        onSelectSession={() => undefined}
        processingConversationIds={["chat-a"]}
        sessions={SESSIONS}
        sessionsError=""
        sessionsStatus="ready"
        sessionsTruncated={false}
      />,
    );

    expect(html).toContain("処理中");
    expect(html).toContain('data-collapsed="false"');
    expect(html).toContain('aria-controls="session-panel-body"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="会話パネルを閉じる"');
    expect(html).toContain(">refresh<");
    expect(html).toContain(">add<");
    expect(html).toContain(">chevron_left<");
    expect(html).toContain(">close<");
    expect(html).not.toContain(">↻<");
    expect(html).not.toContain(">+<");
    expect(html).not.toContain(">‹<");
    expect(html).not.toContain(">×<");
    expect(html).toContain('data-processing="true"');
    expect(html).toContain('data-active="false"');
    expect(html).toContain(">Session A<");
    expect(html).not.toContain('disabled="" data-active="false"');
  });

  test("desktop collapsed state は丸い再表示ボタンだけを残す", () => {
    const html = renderToStaticMarkup(
      <SessionRail
        activeConversationId="chat-b"
        canRefreshSessions={true}
        isCollapsed={true}
        isOverlayOpen={false}
        onClose={() => undefined}
        onToggleCollapsed={() => undefined}
        onNewSession={() => undefined}
        onRefreshSessions={() => undefined}
        onSelectSession={() => undefined}
        processingConversationIds={[]}
        sessions={SESSIONS}
        sessionsError=""
        sessionsStatus="ready"
        sessionsTruncated={false}
      />,
    );

    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('aria-controls="session-panel-body"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="会話パネルを開く"');
    expect(html).toContain("panel-collapsed-slot-start");
    expect(html).toContain('class="panel-reopen-button"');
    expect(html).toContain(">chevron_right<");
    expect(html).not.toContain(">›<");
    expect(html).not.toContain("panel-rail-label");
    expect(html).not.toContain(">会話<");
    expect(html).not.toContain("AWS セッションを更新");
    expect(html).not.toContain(">Session A<");
  });
});
