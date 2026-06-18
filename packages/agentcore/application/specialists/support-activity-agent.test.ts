import { describe, expect, test } from "bun:test";

import type { Config } from "../../infra/config.ts";
import type { StructuredDataProvider } from "../../infra/structured-data.ts";
import type { AgentDeps } from "../agent-deps.ts";
import {
  buildSupportActivityAgent,
  buildSupportActivityTool,
  SUPPORT_ACTIVITY_TOOL_DESCRIPTION,
  SUPPORT_ACTIVITY_TOOL_NAME,
} from "./support-activity-agent.ts";

function makeConfig(): Config {
  return {
    modelId: "jp.anthropic.claude-test",
    region: "ap-northeast-1",
    kbIds: {
      database: "kb-db",
      document: "kb-doc",
      law: "kb-law",
      medical_care_law: "kb-medical-care-law",
    },
    memoryId: undefined,
    numberOfResults: 5,
    supportActivity: {
      kbId: "kb-support-activity",
      kbArn:
        "arn:aws:bedrock:ap-northeast-1:123456789012:knowledge-base/KB12345678",
      includeGeneratedSql: false,
    },
  };
}

class FakeStructuredDataProvider implements StructuredDataProvider {
  readonly queries: string[] = [];

  async query({ query }: { query: string }): Promise<string> {
    this.queries.push(query);
    return "status,count\nopen,3";
  }
}

describe("buildSupportActivityAgent", () => {
  test("support activity structured data だけを引く tool を 1 つ持つ", async () => {
    const provider = new FakeStructuredDataProvider();
    const deps: AgentDeps = {
      config: makeConfig(),
      supportActivityProvider: provider,
    };
    const agent = buildSupportActivityAgent(deps);

    const structuredDataTool = agent.tool.query_structured_data;
    expect(structuredDataTool).toBeDefined();

    const result = await structuredDataTool?.invoke({
      query: "Count open cases by status",
    });

    const text = JSON.stringify(result);
    expect(text).toContain("status,count");
    expect(provider.queries).toEqual(["Count open cases by status"]);
  });
});

describe("buildSupportActivityTool", () => {
  test("supervisor から呼ぶ tool metadata を返す", () => {
    const deps: AgentDeps = { config: makeConfig() };
    const tool = buildSupportActivityTool(deps);

    expect(tool.name).toBe(SUPPORT_ACTIVITY_TOOL_NAME);
    expect(tool.description).toBe(SUPPORT_ACTIVITY_TOOL_DESCRIPTION);
  });
});
