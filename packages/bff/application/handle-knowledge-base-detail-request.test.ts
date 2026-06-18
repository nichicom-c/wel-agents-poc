import { describe, expect, test } from "bun:test";

import {
  handleKnowledgeBaseDetailRequest,
  type KnowledgeBaseDetailProvider,
} from "./handle-knowledge-base-detail-request.ts";

const AUTH = { actorId: "u-user-1", userId: "user-1" };
const KNOWLEDGE_BASE_IDS = {
  database: "KBDB000001",
  document: "KBDOC00001",
  law: "KBLAW0001",
  medical_care_law: "KBMED00001",
  support_activity: "KBSUP00001",
};

function provider(): KnowledgeBaseDetailProvider {
  return {
    getOverview: async ({ domain, knowledgeBaseId }) => ({
      dataSources: [
        {
          dataSourceId: "DS12345678",
          knowledgeBaseId,
          name: `${domain}-s3`,
          status: "AVAILABLE",
          updatedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
      domain,
      knowledgeBase: {
        knowledgeBaseId,
        name: `${domain}-kb`,
        status: "ACTIVE",
        type: domain === "support_activity" ? "SQL" : "VECTOR",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
      knowledgeBaseId,
    }),
    listDocuments: async ({ dataSourceId, domain, knowledgeBaseId }) => ({
      dataSourceId,
      documents: [
        {
          dataSourceId,
          identifier: {
            dataSourceType: "S3",
            s3Uri: "s3://example/document.md",
          },
          knowledgeBaseId,
          status: "INDEXED",
          updatedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
      domain,
      knowledgeBaseId,
      nextToken: "next-1",
    }),
  };
}

describe("handleKnowledgeBaseDetailRequest", () => {
  test("requires authentication", async () => {
    const response = await handleKnowledgeBaseDetailRequest(
      { method: "GET", path: "/api/knowledge-bases/medical_care_law" },
      {
        getKnowledgeBaseDetail: provider(),
        knowledgeBaseIds: KNOWLEDGE_BASE_IDS,
      },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "authentication required",
    });
  });

  test("rejects unknown domains before calling provider", async () => {
    let called = false;
    const response = await handleKnowledgeBaseDetailRequest(
      { method: "GET", path: "/api/knowledge-bases/unknown" },
      {
        authContext: AUTH,
        getKnowledgeBaseDetail: {
          getOverview: async () => {
            called = true;
            throw new Error("must not be called");
          },
          listDocuments: async () => {
            called = true;
            throw new Error("must not be called");
          },
        },
        knowledgeBaseIds: KNOWLEDGE_BASE_IDS,
      },
    );

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "not found" });
    expect(called).toBe(false);
  });

  test("uses configured KB ID for overview", async () => {
    let captured: Record<string, unknown> | undefined;
    const response = await handleKnowledgeBaseDetailRequest(
      { method: "GET", path: "/api/knowledge-bases/medical_care_law" },
      {
        authContext: AUTH,
        getKnowledgeBaseDetail: {
          ...provider(),
          getOverview: async (input) => {
            captured = input;
            return provider().getOverview(input);
          },
        },
        knowledgeBaseIds: KNOWLEDGE_BASE_IDS,
      },
    );

    expect(response.statusCode).toBe(200);
    expect(captured).toEqual({
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
    });
    expect(JSON.parse(response.body)).toMatchObject({
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
      knowledgeBase: {
        name: "medical_care_law-kb",
        type: "VECTOR",
      },
    });
  });

  test("lists documents with bounded pagination parameters", async () => {
    let captured: Record<string, unknown> | undefined;
    const response = await handleKnowledgeBaseDetailRequest(
      {
        method: "GET",
        path: "/api/knowledge-bases/medical_care_law/data-sources/DS12345678/documents",
        query: {
          maxResults: "5000",
          nextToken: "next-0",
        },
      },
      {
        authContext: AUTH,
        getKnowledgeBaseDetail: {
          ...provider(),
          listDocuments: async (input) => {
            captured = input;
            return provider().listDocuments(input);
          },
        },
        knowledgeBaseIds: KNOWLEDGE_BASE_IDS,
      },
    );

    expect(response.statusCode).toBe(200);
    expect(captured).toEqual({
      dataSourceId: "DS12345678",
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
      maxResults: 1000,
      nextToken: "next-0",
    });
    expect(JSON.parse(response.body)).toMatchObject({
      dataSourceId: "DS12345678",
      documents: [
        {
          identifier: {
            dataSourceType: "S3",
            s3Uri: "s3://example/document.md",
          },
          status: "INDEXED",
        },
      ],
      nextToken: "next-1",
    });
  });

  test("not configured KB does not call provider", async () => {
    let called = false;
    const response = await handleKnowledgeBaseDetailRequest(
      { method: "GET", path: "/api/knowledge-bases/document" },
      {
        authContext: AUTH,
        getKnowledgeBaseDetail: {
          getOverview: async () => {
            called = true;
            throw new Error("must not be called");
          },
          listDocuments: async () => {
            called = true;
            throw new Error("must not be called");
          },
        },
        knowledgeBaseIds: {
          ...KNOWLEDGE_BASE_IDS,
          document: "not_configured",
        },
      },
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "Knowledge Base is not configured",
    });
    expect(called).toBe(false);
  });
});
