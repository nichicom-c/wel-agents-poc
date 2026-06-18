import { describe, expect, test } from "bun:test";

import {
  isKnowledgeBaseNotConfiguredError,
  requestKnowledgeBaseDocuments,
  requestKnowledgeBaseOverview,
} from "./knowledge-base-detail.ts";

describe("requestKnowledgeBaseOverview", () => {
  test("GET /api/knowledge-bases/:domain に Bearer access token を送って response を正規化する", async () => {
    let captured: { headers?: Headers; method?: string; url?: string } = {};
    const response = await requestKnowledgeBaseOverview({
      accessToken: " jwt-token ",
      domain: "medical_care_law",
      fetchFn: async (url, init) => {
        captured = {
          headers: new Headers(init?.headers),
          method: init?.method,
          url: String(url),
        };
        return Response.json({
          dataSources: [
            {
              dataSourceId: "DS12345678",
              knowledgeBaseId: "KBMED00001",
              name: "medical-s3",
              status: "AVAILABLE",
              updatedAt: "2026-06-18T02:00:00.000Z",
            },
            { dataSourceId: "" },
          ],
          domain: "medical_care_law",
          knowledgeBase: {
            createdAt: "2026-06-18T00:00:00.000Z",
            failureReasons: [" sync failed ", ""],
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
          nextToken: "next-1",
          secret: "must-not-surface",
        });
      },
    });

    expect(captured).toEqual({
      headers: expect.any(Headers),
      method: "GET",
      url: "/api/knowledge-bases/medical_care_law",
    });
    expect(captured.headers?.get("authorization")).toBe("Bearer jwt-token");
    expect(response).toMatchObject({
      dataSources: [
        {
          dataSourceId: "DS12345678",
          knowledgeBaseId: "KBMED00001",
          name: "medical-s3",
          status: "AVAILABLE",
          updatedAt: "2026-06-18T02:00:00.000Z",
        },
      ],
      domain: "medical_care_law",
      knowledgeBase: {
        createdAt: "2026-06-18T00:00:00.000Z",
        failureReasons: ["sync failed"],
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
      nextToken: "next-1",
    });
    expect(JSON.stringify(response)).not.toContain("must-not-surface");
  });

  test("access token がなければ readable error を throw する", async () => {
    await expect(
      requestKnowledgeBaseOverview({
        accessToken: " ",
        domain: "medical_care_law",
        fetchFn: async () => {
          throw new Error("must not be called");
        },
      }),
    ).rejects.toThrow("access token is required");
  });

  test("503 の KB 未設定 error を識別できる", async () => {
    try {
      await requestKnowledgeBaseOverview({
        accessToken: "jwt-token",
        domain: "medical_care_law",
        fetchFn: async () =>
          Response.json(
            { error: "Knowledge Base is not configured" },
            { status: 503 },
          ),
      });
      throw new Error("must throw");
    } catch (error) {
      expect(isKnowledgeBaseNotConfiguredError(error)).toBe(true);
    }
  });
});

describe("requestKnowledgeBaseDocuments", () => {
  test("documents route に query を付けて document details を正規化する", async () => {
    let captured: { headers?: Headers; method?: string; url?: string } = {};
    const response = await requestKnowledgeBaseDocuments({
      accessToken: "jwt-token",
      dataSourceId: "DS12345678",
      domain: "medical_care_law",
      fetchFn: async (url, init) => {
        captured = {
          headers: new Headers(init?.headers),
          method: init?.method,
          url: String(url),
        };
        return Response.json({
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
            { dataSourceId: "DS00000000" },
          ],
          domain: "medical_care_law",
          knowledgeBaseId: "KBMED00001",
          nextToken: "next-2",
        });
      },
      maxResults: 25,
      nextToken: "next-1",
    });

    expect(captured).toEqual({
      headers: expect.any(Headers),
      method: "GET",
      url: "/api/knowledge-bases/medical_care_law/data-sources/DS12345678/documents?maxResults=25&nextToken=next-1",
    });
    expect(captured.headers?.get("authorization")).toBe("Bearer jwt-token");
    expect(response).toEqual({
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
      nextToken: "next-2",
    });
  });

  test("missing values は fallback と空配列に正規化する", async () => {
    const response = await requestKnowledgeBaseDocuments({
      accessToken: "jwt-token",
      dataSourceId: "DS12345678",
      domain: "database",
      fetchFn: async () => Response.json({}),
    });

    expect(response).toEqual({
      dataSourceId: "DS12345678",
      documents: [],
      domain: "database",
      knowledgeBaseId: "unknown",
    });
  });
});
