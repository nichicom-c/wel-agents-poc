import { describe, expect, test } from "bun:test";
import type {
  RetrieveCommand,
  RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import {
  formatRetrievalResults,
  makeKbSearchTool,
  NO_INFORMATION_MESSAGE,
  type RetrieveClient,
  searchKb,
} from "./knowledge-base.ts";

/** retrieve を模した fake client。送信された command を記録する。 */
class FakeRetrieveClient implements RetrieveClient {
  readonly calls: RetrieveCommand[] = [];
  constructor(private readonly response: RetrieveCommandOutput) {}
  async send(command: RetrieveCommand): Promise<RetrieveCommandOutput> {
    this.calls.push(command);
    return this.response;
  }
}

function responseWith(...texts: string[]): RetrieveCommandOutput {
  return {
    retrievalResults: texts.map((text) => ({ content: { text } })),
    $metadata: {},
  } as RetrieveCommandOutput;
}

describe("formatRetrievalResults", () => {
  test("本文チャンクを連結する", () => {
    expect(formatRetrievalResults(responseWith("alpha", "beta"))).toBe(
      "alpha\n\nbeta",
    );
  });

  test("空結果は定型文を返す", () => {
    expect(
      formatRetrievalResults({ $metadata: {} } as RetrieveCommandOutput),
    ).toBe(NO_INFORMATION_MESSAGE);
    expect(formatRetrievalResults(responseWith())).toBe(NO_INFORMATION_MESSAGE);
  });

  test("空文字・空白のみのチャンクは読み飛ばす", () => {
    const response = {
      retrievalResults: [
        { content: {} },
        { content: { text: "  " } },
        { content: { text: "ok" } },
      ],
      $metadata: {},
    } as RetrieveCommandOutput;
    expect(formatRetrievalResults(response)).toBe("ok");
  });
});

describe("searchKb", () => {
  test("期待した Retrieve リクエストを組み立てる", async () => {
    const client = new FakeRetrieveClient(responseWith("chunk"));
    const result = await searchKb(client, "kb-123", "what is ec2?", 3);
    expect(result).toBe("chunk");
    expect(client.calls).toHaveLength(1);
    const input = client.calls[0]?.input;
    expect(input?.knowledgeBaseId).toBe("kb-123");
    expect(input?.retrievalQuery).toEqual({ text: "what is ec2?" });
    expect(input?.retrievalConfiguration).toEqual({
      vectorSearchConfiguration: { numberOfResults: 3 },
    });
  });
});

describe("makeKbSearchTool", () => {
  test("client 注入で boto3 / 実 client なしに tool を生成し query だけを受ける", async () => {
    const client = new FakeRetrieveClient(responseWith("from-aws-kb"));
    const kbTool = makeKbSearchTool("kb-aws", { client });
    expect(kbTool.name).toBe("search_knowledge_base");
    const output = await kbTool.invoke({ query: "ec2?" });
    expect(output).toBe("from-aws-kb");
    expect(client.calls[0]?.input.knowledgeBaseId).toBe("kb-aws");
  });

  test("kb_id は closure に束縛され tool の入力スキーマに現れない", () => {
    const client = new FakeRetrieveClient(responseWith("x"));
    const kbTool = makeKbSearchTool("kb-secret", { client });
    const properties = Object.keys(
      kbTool.toolSpec.inputSchema?.properties ?? {},
    );
    expect(properties).toEqual(["query"]);
    expect(JSON.stringify(kbTool.toolSpec)).not.toContain("kb-secret");
  });
});
