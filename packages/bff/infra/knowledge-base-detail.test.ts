import { describe, expect, test } from "bun:test";

import {
  type BedrockAgentMetadataClient,
  makeKnowledgeBaseDetailProvider,
} from "./knowledge-base-detail.ts";

type RecordedCommand = {
  constructor: { name: string };
  input?: unknown;
};

class FakeBedrockAgentClient {
  readonly calls: RecordedCommand[] = [];

  async send(command: RecordedCommand): Promise<unknown> {
    this.calls.push(command);
    const name = command.constructor.name;
    if (name === "GetKnowledgeBaseCommand") {
      return {
        knowledgeBase: {
          createdAt: new Date("2026-06-18T00:00:00.000Z"),
          knowledgeBaseConfiguration: {
            type: "VECTOR",
            vectorKnowledgeBaseConfiguration: {
              embeddingModelArn: "arn:aws:bedrock:model",
            },
          },
          knowledgeBaseId: "KBMED00001",
          name: "medical-kb",
          status: "ACTIVE",
          storageConfiguration: {
            s3VectorsConfiguration: {
              indexArn: "arn:aws:s3vectors:index",
              indexName: "medical-care-law",
            },
            type: "S3_VECTORS",
          },
          updatedAt: new Date("2026-06-18T01:00:00.000Z"),
        },
      };
    }

    if (name === "ListDataSourcesCommand") {
      return {
        dataSourceSummaries: [
          {
            dataSourceId: "DS12345678",
            knowledgeBaseId: "KBMED00001",
            name: "medical-s3",
            status: "AVAILABLE",
            updatedAt: new Date("2026-06-18T02:00:00.000Z"),
          },
        ],
        nextToken: "ds-next",
      };
    }

    if (name === "ListKnowledgeBaseDocumentsCommand") {
      return {
        documentDetails: [
          {
            dataSourceId: "DS12345678",
            identifier: {
              dataSourceType: "S3",
              s3: { uri: "s3://bucket/medical.md" },
            },
            knowledgeBaseId: "KBMED00001",
            status: "INDEXED",
            statusReason: "ok",
            updatedAt: new Date("2026-06-18T03:00:00.000Z"),
          },
        ],
        nextToken: "doc-next",
      };
    }

    throw new Error(`unexpected command ${name}`);
  }
}

describe("makeKnowledgeBaseDetailProvider", () => {
  test("formats KB overview and data sources", async () => {
    const client = new FakeBedrockAgentClient();
    const provider = makeKnowledgeBaseDetailProvider({
      client: client as unknown as BedrockAgentMetadataClient,
    });

    const result = await provider.getOverview({
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
    });

    expect(result).toMatchObject({
      dataSources: [
        {
          dataSourceId: "DS12345678",
          name: "medical-s3",
          status: "AVAILABLE",
          updatedAt: "2026-06-18T02:00:00.000Z",
        },
      ],
      domain: "medical_care_law",
      knowledgeBase: {
        knowledgeBaseId: "KBMED00001",
        name: "medical-kb",
        status: "ACTIVE",
        storage: {
          s3VectorsConfiguration: {
            indexName: "medical-care-law",
          },
          type: "S3_VECTORS",
        },
        type: "VECTOR",
        updatedAt: "2026-06-18T01:00:00.000Z",
      },
      knowledgeBaseId: "KBMED00001",
      nextToken: "ds-next",
    });
    expect(client.calls.map((command) => command.constructor.name)).toEqual([
      "GetKnowledgeBaseCommand",
      "ListDataSourcesCommand",
    ]);
    expect(client.calls.map((command) => command.input)).toEqual([
      { knowledgeBaseId: "KBMED00001" },
      { knowledgeBaseId: "KBMED00001", maxResults: 100 },
    ]);
  });

  test("formats document details and pagination", async () => {
    const client = new FakeBedrockAgentClient();
    const provider = makeKnowledgeBaseDetailProvider({
      client: client as unknown as BedrockAgentMetadataClient,
    });

    const result = await provider.listDocuments({
      dataSourceId: "DS12345678",
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
      maxResults: 50,
      nextToken: "doc-prev",
    });

    expect(result).toEqual({
      dataSourceId: "DS12345678",
      documents: [
        {
          dataSourceId: "DS12345678",
          identifier: {
            dataSourceType: "S3",
            s3Uri: "s3://bucket/medical.md",
          },
          knowledgeBaseId: "KBMED00001",
          status: "INDEXED",
          statusReason: "ok",
          updatedAt: "2026-06-18T03:00:00.000Z",
        },
      ],
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
      nextToken: "doc-next",
    });
    expect(client.calls.at(-1)?.input).toEqual({
      dataSourceId: "DS12345678",
      knowledgeBaseId: "KBMED00001",
      maxResults: 50,
      nextToken: "doc-prev",
    });
  });
});
