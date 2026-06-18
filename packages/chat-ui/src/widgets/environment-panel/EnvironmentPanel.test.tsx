import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { DevInfo } from "../../features/dev-info/index.ts";
import { EnvironmentPanel } from "./EnvironmentPanel.tsx";

const DEV_INFO: DevInfo = {
  auth: {
    clientId: "client-1",
    jwtIssuer: "https://issuer.example",
  },
  aws: {
    accountId: "123456789012",
    region: "ap-northeast-1",
  },
  bff: {
    apiEndpoint: "https://api.example",
    authMode: "jwt",
    health: { checkedAt: "2026-06-18T00:00:00.000Z", status: "ok" },
    lambdaFunctionName: "wel-agents-bff",
    lambdaLogGroupName: "/aws/lambda/wel-agents-bff",
  },
  chatUi: {
    apiRouteBase: "https://chat.example/api",
    origin: "https://chat.example",
  },
  generatedAt: "2026-06-18T00:00:00.000Z",
  knowledgeBases: {
    database: "KBDB000001",
    document: "not_configured",
    law: "KBLAW0001",
    medical_care_law: "KBMED00001",
    support_activity: "KBSUP00001",
  },
  memory: { id: "memory-1" },
  runtime: {
    arn: "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
    endpointName: "sample",
    health: {
      reason: "production runtime health is not checked by this endpoint",
      status: "not_checked",
    },
    qualifier: "sample",
  },
};

function renderEnvironmentPanel(
  isCollapsed: boolean,
  devInfo: DevInfo | null = null,
) {
  return renderToStaticMarkup(
    <EnvironmentPanel
      authError=""
      authState={{
        accessToken: "dev-local",
        mode: "dev",
        status: "authenticated",
      }}
      canRefreshDevInfo={true}
      conversationIdInput="chat-a"
      devInfo={devInfo}
      devInfoError=""
      devInfoStatus="idle"
      isCollapsed={isCollapsed}
      isOverlayOpen={false}
      onClose={() => undefined}
      onConversationIdBlur={() => undefined}
      onConversationIdInputChange={() => undefined}
      onOpenKnowledgeBase={() => undefined}
      onRefreshDevInfo={() => undefined}
      onSignIn={() => undefined}
      onSignOut={() => undefined}
      onToggleCollapsed={() => undefined}
      sessionsStatus="ready"
      status="idle"
    />,
  );
}

describe("EnvironmentPanel", () => {
  test("desktop collapsed state は丸い再表示ボタンだけを残す", () => {
    const html = renderEnvironmentPanel(true);

    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('aria-controls="environment-panel-body"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="環境パネルを開く"');
    expect(html).toContain("panel-collapsed-slot-end");
    expect(html).toContain('class="panel-reopen-button"');
    expect(html).toContain(">chevron_left<");
    expect(html).not.toContain(">‹<");
    expect(html).not.toContain("panel-rail-label");
    expect(html).not.toContain(">環境<");
    expect(html).not.toContain("Conversation ID");
    expect(html).not.toContain(">更新<");
  });

  test("open state は環境 panel body と close control を表示する", () => {
    const html = renderEnvironmentPanel(false);

    expect(html).toContain('data-collapsed="false"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="環境パネルを閉じる"');
    expect(html).toContain(">refresh<");
    expect(html).toContain(">chevron_right<");
    expect(html).toContain(">close<");
    expect(html).not.toContain(">›<");
    expect(html).not.toContain(">×<");
    expect(html).toContain("Conversation ID");
  });

  test("設定済み KB row は詳細 page への affordance を持つ", () => {
    const html = renderEnvironmentPanel(false, DEV_INFO);

    expect(html).toContain('aria-label="KB medical を開く"');
    expect(html).toContain(">open_in_new<");
    expect(html).toContain("KBMED00001");
    expect(html).not.toContain('aria-label="KB document を開く"');
  });
});
