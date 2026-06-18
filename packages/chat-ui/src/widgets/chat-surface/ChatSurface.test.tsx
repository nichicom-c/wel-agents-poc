import { describe, expect, test } from "bun:test";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatSurface } from "./ChatSurface.tsx";

function renderChatSurface(
  isBusy: boolean,
  panelState: {
    isEnvironmentPanelOpen?: boolean;
    isSessionPanelOpen?: boolean;
  } = {},
) {
  return renderToStaticMarkup(
    <ChatSurface
      activeAssistantProgress={null}
      canSend={!isBusy}
      inputRef={createRef<HTMLTextAreaElement>()}
      isBusy={isBusy}
      isEnvironmentPanelOpen={panelState.isEnvironmentPanelOpen ?? false}
      isSessionPanelOpen={panelState.isSessionPanelOpen ?? false}
      messages={[]}
      onComposerKeyDown={() => undefined}
      onOpenEnvironmentPanel={() => undefined}
      onOpenSessionPanel={() => undefined}
      onPromptChange={() => undefined}
      onSubmit={() => undefined}
      prompt=""
      threadRef={createRef<HTMLDivElement>()}
    />,
  );
}

describe("ChatSurface", () => {
  test("active session が busy のときだけ composer を disabled にする", () => {
    expect(renderChatSurface(true)).toContain("<textarea");
    expect(renderChatSurface(true)).toContain("disabled");
    expect(renderChatSurface(false)).not.toContain("disabled");
  });

  test("mobile panel buttons keep aria-expanded state", () => {
    const html = renderChatSurface(false, {
      isEnvironmentPanelOpen: true,
      isSessionPanelOpen: true,
    });

    expect(html).toContain('aria-controls="session-panel"');
    expect(html).toContain('aria-controls="environment-panel"');
    expect(html).toContain('aria-label="会話履歴を開く"');
    expect(html).toContain('aria-label="環境情報を開く"');
    expect(html.match(/aria-expanded="true"/g)?.length).toBe(2);
  });

  test("操作 affordance は Material Symbols icon で表示する", () => {
    const html = renderChatSurface(false);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(">menu<");
    expect(html).toContain(">info<");
    expect(html).toContain(">arrow_upward<");
    expect(html).not.toContain(">☰<");
    expect(html).not.toContain(">i<");
    expect(html).not.toContain(">↑<");
  });
});
