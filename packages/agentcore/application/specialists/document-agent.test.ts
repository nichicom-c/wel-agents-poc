import { describe, expect, test } from "bun:test";
import type {
  RetrieveCommand,
  RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import type { Config } from "../../infra/config.ts";
import type { RetrieveClient } from "../../infra/knowledge-base.ts";
import type { AgentDeps } from "../agent-deps.ts";
import {
  buildDocumentAgent,
  buildDocumentTool,
  DOCUMENT_TOOL_DESCRIPTION,
  DOCUMENT_TOOL_NAME,
} from "./document-agent.ts";

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

describe("buildDocumentAgent", () => {
  test("document KB だけを引く tool を 1 つ持つ", async () => {
    const client = new FakeRetrieveClient();
    const deps: AgentDeps = { config: makeConfig(), kbClient: client };
    const agent = buildDocumentAgent(deps);

    const kbTool = agent.tool.search_knowledge_base;
    expect(kbTool).toBeDefined();
    await kbTool?.invoke({ query: "what is the policy?" });
    expect(client.calls[0]?.input.knowledgeBaseId).toBe("kb-doc");
  });
});

describe("buildDocumentTool", () => {
  test("supervisor から呼ぶ tool metadata を返す", () => {
    const deps: AgentDeps = {
      config: makeConfig(),
      kbClient: new FakeRetrieveClient(),
    };
    const tool = buildDocumentTool(deps);

    expect(tool.name).toBe(DOCUMENT_TOOL_NAME);
    expect(tool.description).toBe(DOCUMENT_TOOL_DESCRIPTION);
  });
});
