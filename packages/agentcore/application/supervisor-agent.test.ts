import { describe, expect, test } from "bun:test";
import type {
  RetrieveCommand,
  RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import type { Config } from "../infra/config.ts";
import type { RetrieveClient } from "../infra/knowledge-base.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { buildSupervisor } from "./supervisor-agent.ts";

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
  async send(_command: RetrieveCommand): Promise<RetrieveCommandOutput> {
    return {
      retrievalResults: [{ content: { text: "stub" } }],
      $metadata: {},
    } as RetrieveCommandOutput;
  }
}

describe("buildSupervisor", () => {
  test("supervisor は複数の専門 tool を正しい名前で束ねる", () => {
    const deps: AgentDeps = {
      config: makeConfig(),
      kbClient: new FakeRetrieveClient(),
    };

    const supervisor = buildSupervisor(deps);
    expect(supervisor.tools.map((t) => t.name).sort()).toEqual([
      "database_rag_agent",
      "document_rag_agent",
      "law_rag_agent",
      "medical_care_law_rag_agent",
      "support_activity_rag_agent",
    ]);
  });
});
