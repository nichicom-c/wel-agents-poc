import { describe, expect, test } from "bun:test";
import type { BedrockModel } from "@strands-agents/sdk";

import type { Config } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import {
  buildSoapGapsChatAgent,
  SOAP_GAPS_CHAT_AGENT_NAME,
} from "./soap-gaps-chat-agent.ts";

function makeConfig(): Config {
  return {
    modelId: "jp.anthropic.claude-test",
    region: "ap-northeast-1",
    kbIds: {
      database: "",
      document: "",
      law: "",
      medical_care_law: "",
    },
    memoryId: undefined,
    numberOfResults: 5,
    supportActivity: {
      kbId: "",
      kbArn: "",
      includeGeneratedSql: false,
    },
  };
}

describe("buildSoapGapsChatAgent", () => {
  test("SOAP_GAPS_CHAT_AGENT_NAME を name に持つ Agent を生成する", () => {
    const deps: AgentDeps = { config: makeConfig() };
    const agent = buildSoapGapsChatAgent(deps);

    expect(agent.name).toBe(SOAP_GAPS_CHAT_AGENT_NAME);
  });

  test("deps.modelFor が指定されればそちらを使う", () => {
    let requestedRole: string | undefined;
    const deps: AgentDeps = {
      config: makeConfig(),
      modelFor: (role) => {
        requestedRole = role;
        return { id: "fake-model" } as unknown as ReturnType<
          NonNullable<AgentDeps["modelFor"]>
        >;
      },
    };

    buildSoapGapsChatAgent(deps);

    expect(requestedRole).toBe("soap_gaps_chat");
  });

  test("config.soapGapsModelId が未設定なら config.modelId を使う", () => {
    const deps: AgentDeps = { config: makeConfig() };
    const agent = buildSoapGapsChatAgent(deps);

    const model = agent.model as BedrockModel;
    expect(model.getConfig().modelId).toBe("jp.anthropic.claude-test");
  });

  test("config.soapGapsModelId が設定されていればそちらを使う（応答時間短縮用）", () => {
    const deps: AgentDeps = {
      config: {
        ...makeConfig(),
        soapGapsModelId: "jp.anthropic.claude-haiku-4-5",
      },
    };
    const agent = buildSoapGapsChatAgent(deps);

    const model = agent.model as BedrockModel;
    expect(model.getConfig().modelId).toBe("jp.anthropic.claude-haiku-4-5");
  });

  test("knowledgeContext が与えられれば systemPrompt 末尾に追記する", () => {
    const deps: AgentDeps = { config: makeConfig() };
    const withoutContext = buildSoapGapsChatAgent(deps);
    const withContext = buildSoapGapsChatAgent(deps, [
      { category: "SAFETY", content: "捏造禁止。", title: "事実の捏造禁止" },
    ]);

    expect(String(withContext.systemPrompt)).toContain("事実の捏造禁止");
    expect(String(withoutContext.systemPrompt)).not.toContain("事実の捏造禁止");
  });
});
