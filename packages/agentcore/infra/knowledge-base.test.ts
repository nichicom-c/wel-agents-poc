import { describe, expect, test } from "bun:test";
import type {
  RetrieveCommand,
  RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import {
  formatRetrievalResults,
  formatSourceHeader,
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

/** 保健師記録 KB の Retrieve が実際に返す形。出典つき整形の検証に使う。 */
const SOURCED_RESULT: NonNullable<
  RetrieveCommandOutput["retrievalResults"]
>[number] = {
  content: { text: "Plan/Do/See の本文" },
  location: {
    s3Location: {
      uri: "s3://wel-agents-rag-data/hokenshi-kiroku/record-guide/2026-11-10/jissen-01-page-034.md",
    },
    type: "S3" as const,
  },
  metadata: {
    content_type: "body",
    output_page: "34",
    section_title: "実践編",
    source_title: "こう書けばわかる！保健師記録",
    unit: "1",
    unit_title: "保健師の思考過程を Plan/Do/See で書く",
    "x-amz-bedrock-kb-chunk-id": "0e09e46d",
    "x-amz-bedrock-kb-data-source-id": "FIMGUVV6G6",
  },
  score: 0.747395932674408,
};

describe("formatSourceHeader", () => {
  test("S3 URI・score・corpus 由来の metadata を 1 行にまとめる", () => {
    expect(formatSourceHeader(1, SOURCED_RESULT)).toBe(
      "[source 1] s3://wel-agents-rag-data/hokenshi-kiroku/record-guide/2026-11-10/jissen-01-page-034.md (score 0.747)\n" +
        "metadata: content_type=body; output_page=34; section_title=実践編; " +
        "source_title=こう書けばわかる！保健師記録; unit=1; " +
        "unit_title=保健師の思考過程を Plan/Do/See で書く",
    );
  });

  test("Bedrock 内部 metadata（x-amz-bedrock-kb-*）は出典に出さない", () => {
    const header = formatSourceHeader(1, SOURCED_RESULT);
    expect(header).not.toContain("x-amz-bedrock-kb-");
    expect(header).not.toContain("FIMGUVV6G6");
  });

  test("metadata を持たない corpus では index だけを出す", () => {
    expect(formatSourceHeader(2, { content: { text: "x" } })).toBe(
      "[source 2]",
    );
  });

  test("空値の属性は落とす", () => {
    expect(
      formatSourceHeader(1, {
        content: { text: "x" },
        metadata: { chapter: "", chapter_title: "第5章" },
      }),
    ).toBe("[source 1]\nmetadata: chapter_title=第5章");
  });
});

describe("formatRetrievalResults", () => {
  test("本文チャンクを出典ヘッダつきで連結する", () => {
    expect(formatRetrievalResults(responseWith("alpha", "beta"))).toBe(
      "[source 1]\nalpha\n\n[source 2]\nbeta",
    );
  });

  test("出典は chunk 本文と一緒に LLM へ渡る", () => {
    const response = {
      retrievalResults: [SOURCED_RESULT],
      $metadata: {},
    } as unknown as RetrieveCommandOutput;
    const formatted = formatRetrievalResults(response);
    expect(formatted).toContain("output_page=34");
    expect(formatted).toContain(
      "unit_title=保健師の思考過程を Plan/Do/See で書く",
    );
    expect(formatted).toEndWith("\nPlan/Do/See の本文");
  });

  test("空結果は定型文を返す", () => {
    expect(
      formatRetrievalResults({ $metadata: {} } as RetrieveCommandOutput),
    ).toBe(NO_INFORMATION_MESSAGE);
    expect(formatRetrievalResults(responseWith())).toBe(NO_INFORMATION_MESSAGE);
  });

  test("空文字・空白のみのチャンクは読み飛ばし、番号は詰める", () => {
    const response = {
      retrievalResults: [
        { content: {} },
        { content: { text: "  " } },
        { content: { text: "ok" } },
      ],
      $metadata: {},
    } as RetrieveCommandOutput;
    expect(formatRetrievalResults(response)).toBe("[source 1]\nok");
  });
});

describe("searchKb", () => {
  test("期待した Retrieve リクエストを組み立てる", async () => {
    const client = new FakeRetrieveClient(responseWith("chunk"));
    const result = await searchKb(client, "kb-123", "what is ec2?", 3);
    expect(result).toBe("[source 1]\nchunk");
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
    expect(output).toBe("[source 1]\nfrom-aws-kb");
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
