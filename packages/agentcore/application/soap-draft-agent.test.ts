import { describe, expect, test } from "bun:test";
import type { BedrockModel } from "@strands-agents/sdk";

import { SOAP_RECORD_TYPES } from "../contracts/soap-draft.ts";
import type { Config } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import {
  buildSoapDraftAgent,
  recordTypeLabel,
  SOAP_DRAFT_AGENT_NAME,
} from "./soap-draft-agent.ts";

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

describe("buildSoapDraftAgent", () => {
  test("SOAP_DRAFT_AGENT_NAME を name に持つ Agent を生成する", () => {
    const deps: AgentDeps = { config: makeConfig() };
    const agent = buildSoapDraftAgent(deps);

    expect(agent.name).toBe(SOAP_DRAFT_AGENT_NAME);
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

    buildSoapDraftAgent(deps);

    expect(requestedRole).toBe("soap_draft");
  });

  test("config.soapDraftModelId が未設定なら config.modelId を使う", () => {
    const deps: AgentDeps = { config: makeConfig() };
    const agent = buildSoapDraftAgent(deps);

    const model = agent.model as BedrockModel;
    expect(model.getConfig().modelId).toBe("jp.anthropic.claude-test");
  });

  test("config.soapDraftModelId が設定されていればそちらを使う（応答時間短縮用）", () => {
    const deps: AgentDeps = {
      config: {
        ...makeConfig(),
        soapDraftModelId: "jp.anthropic.claude-haiku-4-5",
      },
    };
    const agent = buildSoapDraftAgent(deps);

    const model = agent.model as BedrockModel;
    expect(model.getConfig().modelId).toBe("jp.anthropic.claude-haiku-4-5");
  });
});

describe("recordTypeLabel", () => {
  test("すべての記録種別に日本語ラベルを持つ", () => {
    for (const recordType of SOAP_RECORD_TYPES) {
      expect(recordTypeLabel(recordType)).toEqual(expect.any(String));
      expect(recordTypeLabel(recordType).length).toBeGreaterThan(0);
    }
  });

  test("既知のマッピングを返す", () => {
    expect(recordTypeLabel("support_activity")).toBe("支援実績");
    expect(recordTypeLabel("general_record")).toBe("汎用記録");
    expect(recordTypeLabel("meeting")).toBe("会議記録");
    expect(recordTypeLabel("summary")).toBe("サマリー");
  });
});
