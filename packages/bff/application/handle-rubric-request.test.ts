import { describe, expect, test } from "bun:test";

import {
  type HandleRubricOptions,
  handleRubricRequest,
} from "./handle-rubric-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const SAMPLE_LEVELS = [
  { criteria: [], definition: "定義1", level: 1 as const, levelName: "要支援" },
  { criteria: [], definition: "定義2", level: 2 as const, levelName: "基礎" },
  { criteria: [], definition: "定義3", level: 3 as const, levelName: "自立" },
  { criteria: [], definition: "定義4", level: 4 as const, levelName: "熟達" },
];

const SAMPLE_RUBRIC = {
  code: "ASSESSMENT",
  createdAt: "2026-07-18T09:00:00.000Z",
  id: "rubric-1",
  isActive: true,
  knowledgeBaseId: "10000000-0000-0000-0000-000000000001",
  levels: SAMPLE_LEVELS,
  name: "アセスメント",
  objective: "S/Oを根拠に評価できる",
  sortOrder: 40,
};

function baseOptions(
  overrides: Partial<HandleRubricOptions> = {},
): HandleRubricOptions {
  return {
    authContext: AUTH_CONTEXT,
    createRubric: async () => SAMPLE_RUBRIC,
    listRubrics: async () => [],
    setActive: async () => ({ ...SAMPLE_RUBRIC, isActive: false }),
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleRubricRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleRubricRequest(
      { method: "OPTIONS", path: "/api/rubrics" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleRubricRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleRubricRequest(
      { method: "GET", path: "/api/rubrics" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleRubricRequest(
      { method: "GET", path: "/api/rubrics" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("POST /api/rubrics", () => {
    test("有効な body でルーブリックを作る", async () => {
      let capturedInput: unknown;
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({
            code: "ASSESSMENT",
            knowledgeBaseId: "10000000-0000-0000-0000-000000000001",
            levels: SAMPLE_LEVELS,
            name: "アセスメント",
            objective: "S/Oを根拠に評価できる",
            sortOrder: 40,
          }),
          method: "POST",
          path: "/api/rubrics",
        },
        baseOptions({
          createRubric: async (input) => {
            capturedInput = input;
            return SAMPLE_RUBRIC;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        code: "ASSESSMENT",
        knowledgeBaseId: "10000000-0000-0000-0000-000000000001",
        levels: SAMPLE_LEVELS,
        name: "アセスメント",
        objective: "S/Oを根拠に評価できる",
        sortOrder: 40,
      });
    });

    test("levels が空なら 400 を返す", async () => {
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({
            code: "ASSESSMENT",
            knowledgeBaseId: "10000000-0000-0000-0000-000000000001",
            levels: [],
            name: "アセスメント",
            objective: "S/Oを根拠に評価できる",
          }),
          method: "POST",
          path: "/api/rubrics",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("level が範囲外なら 400 を返す", async () => {
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({
            code: "ASSESSMENT",
            knowledgeBaseId: "10000000-0000-0000-0000-000000000001",
            levels: [{ definition: "x", level: 5, levelName: "invalid" }],
            name: "アセスメント",
            objective: "S/Oを根拠に評価できる",
          }),
          method: "POST",
          path: "/api/rubrics",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/rubrics/:id/active", () => {
    test("有効な body で is_active を変更する", async () => {
      let capturedInput: unknown;
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({ isActive: false }),
          method: "PATCH",
          path: "/api/rubrics/rubric-1/active",
        },
        baseOptions({
          setActive: async (input) => {
            capturedInput = input;
            return { ...SAMPLE_RUBRIC, isActive: false };
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({ id: "rubric-1", isActive: false });
    });

    test("isActive が boolean でなければ 400 を返す", async () => {
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({ isActive: "x" }),
          method: "PATCH",
          path: "/api/rubrics/rubric-1/active",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });
});
