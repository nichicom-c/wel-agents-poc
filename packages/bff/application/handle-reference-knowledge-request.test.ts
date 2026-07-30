import { describe, expect, test } from "bun:test";

import {
  type HandleReferenceKnowledgeOptions,
  handleReferenceKnowledgeRequest,
} from "./handle-reference-knowledge-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

function baseOptions(
  overrides: Partial<HandleReferenceKnowledgeOptions> = {},
): HandleReferenceKnowledgeOptions {
  return {
    authContext: AUTH_CONTEXT,
    listReferenceKnowledge: async () => [],
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleReferenceKnowledgeRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleReferenceKnowledgeRequest(
      { method: "OPTIONS", path: "/api/reference-knowledge" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleReferenceKnowledgeRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleReferenceKnowledgeRequest(
      { method: "GET", path: "/api/reference-knowledge" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleReferenceKnowledgeRequest(
      { method: "GET", path: "/api/reference-knowledge" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  test("referenceKnowledge 一覧を返す", async () => {
    const response = await handleReferenceKnowledgeRequest(
      { method: "GET", path: "/api/reference-knowledge" },
      baseOptions({
        listReferenceKnowledge: async () => [
          {
            id: "rk-1",
            linkedMaterialIds: [],
            linkedRubricIds: [],
            sourceType: "law",
            summary: "summary text",
            title: "title text",
          },
        ],
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).referenceKnowledge).toHaveLength(1);
  });

  test("listReferenceKnowledge が例外を投げたら 502 を返す", async () => {
    const response = await handleReferenceKnowledgeRequest(
      { method: "GET", path: "/api/reference-knowledge" },
      baseOptions({
        listReferenceKnowledge: async () => {
          throw new Error("boom");
        },
      }),
    );
    expect(response.statusCode).toBe(502);
  });
});
