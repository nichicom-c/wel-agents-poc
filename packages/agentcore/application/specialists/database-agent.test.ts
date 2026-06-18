import { describe, expect, test } from "bun:test";
import type {
  RetrieveCommand,
  RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import type { Config } from "../../infra/config.ts";
import type { RetrieveClient } from "../../infra/knowledge-base.ts";
import type { AgentDeps } from "../agent-deps.ts";
import {
  buildDatabaseAgent,
  buildDatabaseTool,
  DATABASE_TOOL_DESCRIPTION,
  DATABASE_TOOL_NAME,
} from "./database-agent.ts";

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

class FakeRetrieveClient implements RetrieveClient {
  readonly calls: RetrieveCommand[] = [];
  async send(command: RetrieveCommand): Promise<RetrieveCommandOutput> {
    this.calls.push(command);
    return {
      retrievalResults: [{ content: { text: "stub" } }],
      $metadata: {},
    } as RetrieveCommandOutput;
  }
}

describe("buildDatabaseAgent", () => {
  test("database KB だけを引く tool を 1 つ持つ", async () => {
    const client = new FakeRetrieveClient();
    const deps: AgentDeps = { config: makeConfig(), kbClient: client };
    const agent = buildDatabaseAgent(deps);

    const kbTool = agent.tool.search_knowledge_base;
    expect(kbTool).toBeDefined();
    await kbTool?.invoke({ query: "how many orders?" });
    expect(client.calls[0]?.input.knowledgeBaseId).toBe("kb-db");
  });
});

describe("buildDatabaseTool", () => {
  test("supervisor から呼ぶ tool metadata を返す", () => {
    const deps: AgentDeps = {
      config: makeConfig(),
      kbClient: new FakeRetrieveClient(),
    };
    const tool = buildDatabaseTool(deps);

    expect(tool.name).toBe(DATABASE_TOOL_NAME);
    expect(tool.description).toBe(DATABASE_TOOL_DESCRIPTION);
  });
});
