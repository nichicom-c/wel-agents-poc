import { describe, expect, test } from "bun:test";
import type { BedrockModel } from "@strands-agents/sdk";

import type { Config } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import {
  buildSoapGapsDetectionAgent,
  SOAP_GAPS_DETECTION_AGENT_NAME,
} from "./soap-gaps-detection-agent.ts";

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

describe("buildSoapGapsDetectionAgent", () => {
  test("SOAP_GAPS_DETECTION_AGENT_NAME を name に持つ Agent を生成する", () => {
    const deps: AgentDeps = { config: makeConfig() };
    const agent = buildSoapGapsDetectionAgent(deps);

    expect(agent.name).toBe(SOAP_GAPS_DETECTION_AGENT_NAME);
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

    buildSoapGapsDetectionAgent(deps);

    expect(requestedRole).toBe("soap_gaps_detection");
  });

  test("config.soapGapsModelId が未設定なら config.modelId を使う", () => {
    const deps: AgentDeps = { config: makeConfig() };
    const agent = buildSoapGapsDetectionAgent(deps);

    const model = agent.model as BedrockModel;
    expect(model.getConfig().modelId).toBe("jp.anthropic.claude-test");
  });

  test("config.soapGapsModelId が設定されていればそちらを使う（soap-gaps-agent と共有）", () => {
    const deps: AgentDeps = {
      config: {
        ...makeConfig(),
        soapGapsModelId: "jp.anthropic.claude-haiku-4-5",
      },
    };
    const agent = buildSoapGapsDetectionAgent(deps);

    const model = agent.model as BedrockModel;
    expect(model.getConfig().modelId).toBe("jp.anthropic.claude-haiku-4-5");
  });
});
