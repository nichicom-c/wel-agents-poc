import { describe, expect, test } from "bun:test";
import type {
  RetrieveCommand,
  RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";
import type { RetrieveClient } from "../infra/knowledge-base.ts";
import {
  buildLawKbComparisonReport,
  formatComparisonJson,
  retrieveLawKbComparison,
} from "./law-kb-comparison.ts";

function responseWith(
  ...items: Array<{
    text: string;
    score?: number;
    location?: unknown;
    metadata?: Record<string, unknown>;
  }>
): RetrieveCommandOutput {
  return {
    retrievalResults: items.map((item) => ({
      content: { text: item.text },
      score: item.score,
      location: item.location,
      metadata: item.metadata,
    })),
    $metadata: {},
  } as RetrieveCommandOutput;
}

class FakeRetrieveClient implements RetrieveClient {
  readonly calls: RetrieveCommand[] = [];

  async send(command: RetrieveCommand): Promise<RetrieveCommandOutput> {
    this.calls.push(command);
    return responseWith({
      text: `result for ${command.input.knowledgeBaseId}`,
    });
  }
}

describe("buildLawKbComparisonReport", () => {
  test("current と hierarchical の Retrieve 結果を比較用 JSON 構造にする", () => {
    const report = buildLawKbComparisonReport({
      query: "通告義務はどこに定められている？",
      numberOfResults: 5,
      current: {
        knowledgeBaseId: "kb-law",
        response: responseWith({
          text: "第六条 ...",
          score: 0.82,
          location: { type: "S3", s3Location: { uri: "s3://bucket/law/a.md" } },
          metadata: { article: "第六条" },
        }),
      },
      hierarchical: {
        knowledgeBaseId: "kb-law-hierarchical",
        response: responseWith(
          {
            text: "第六条 parent ...",
            score: 0.91,
            location: {
              type: "S3",
              s3Location: { uri: "s3://bucket/law/a.md" },
            },
            metadata: { article: "第六条", chunkType: "parent" },
          },
          { text: "  " },
        ),
      },
    });

    expect(report).toEqual({
      query: "通告義務はどこに定められている？",
      numberOfResults: 5,
      current: {
        knowledgeBaseId: "kb-law",
        resultCount: 1,
        results: [
          {
            index: 1,
            text: "第六条 ...",
            score: 0.82,
            location: {
              type: "S3",
              s3Location: { uri: "s3://bucket/law/a.md" },
            },
            metadata: { article: "第六条" },
          },
        ],
      },
      hierarchical: {
        knowledgeBaseId: "kb-law-hierarchical",
        resultCount: 1,
        results: [
          {
            index: 1,
            text: "第六条 parent ...",
            score: 0.91,
            location: {
              type: "S3",
              s3Location: { uri: "s3://bucket/law/a.md" },
            },
            metadata: { article: "第六条", chunkType: "parent" },
          },
        ],
      },
    });
  });
});

describe("formatComparisonJson", () => {
  test("人が読める JSON に整形する", () => {
    const report = buildLawKbComparisonReport({
      query: "test",
      numberOfResults: 1,
      current: { knowledgeBaseId: "current", response: responseWith() },
      hierarchical: {
        knowledgeBaseId: "hierarchical",
        response: responseWith(),
      },
    });

    expect(formatComparisonJson(report)).toContain('\n  "query": "test"');
  });
});

describe("retrieveLawKbComparison", () => {
  test("同じ query を current と hierarchical の両方に送る", async () => {
    const client = new FakeRetrieveClient();
    const report = await retrieveLawKbComparison(client, {
      query: "第六条を教えて",
      currentKnowledgeBaseId: "kb-law",
      hierarchicalKnowledgeBaseId: "kb-law-hierarchical",
      numberOfResults: 4,
    });

    expect(client.calls).toHaveLength(2);
    expect(client.calls.map((call) => call.input.knowledgeBaseId)).toEqual([
      "kb-law",
      "kb-law-hierarchical",
    ]);
    expect(client.calls.map((call) => call.input.retrievalQuery?.text)).toEqual(
      ["第六条を教えて", "第六条を教えて"],
    );
    expect(
      client.calls.map(
        (call) =>
          call.input.retrievalConfiguration?.vectorSearchConfiguration
            ?.numberOfResults,
      ),
    ).toEqual([4, 4]);
    expect(report.current.resultCount).toBe(1);
    expect(report.hierarchical.resultCount).toBe(1);
  });
});
