import { describe, expect, test } from "bun:test";

import {
  type HandleRequiredItemOptions,
  handleRequiredItemRequest,
} from "./handle-required-item-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const SAMPLE_ITEM = {
  aggregationCategory: "基本情報",
  id: "req-item-1",
  itemName: "訪問日時",
  recordType: "support_activity" as const,
  requirementLevel: "required" as const,
};

function baseOptions(
  overrides: Partial<HandleRequiredItemOptions> = {},
): HandleRequiredItemOptions {
  return {
    authContext: AUTH_CONTEXT,
    createItem: async () => SAMPLE_ITEM,
    listItems: async () => [],
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleRequiredItemRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleRequiredItemRequest(
      { method: "OPTIONS", path: "/api/required-items" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleRequiredItemRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleRequiredItemRequest(
      { method: "GET", path: "/api/required-items" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleRequiredItemRequest(
      { method: "GET", path: "/api/required-items" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("GET /api/required-items", () => {
    test("query から filters を組み立てて渡す", async () => {
      let capturedFilters: unknown;
      await handleRequiredItemRequest(
        {
          method: "GET",
          path: "/api/required-items",
          query: {
            recordType: "support_activity",
            specialtyId: "maternal-child",
          },
        },
        baseOptions({
          listItems: async (filters) => {
            capturedFilters = filters;
            return [SAMPLE_ITEM];
          },
        }),
      );

      expect(capturedFilters).toEqual({
        recordType: "support_activity",
        specialtyId: "maternal-child",
      });
    });
  });

  describe("POST /api/required-items", () => {
    test("有効な body で項目を作る", async () => {
      let capturedInput: unknown;
      const response = await handleRequiredItemRequest(
        {
          body: JSON.stringify({
            aggregationCategory: "基本情報",
            itemName: "訪問日時",
            recordType: "support_activity",
            requirementLevel: "required",
          }),
          method: "POST",
          path: "/api/required-items",
        },
        baseOptions({
          createItem: async (input) => {
            capturedInput = input;
            return SAMPLE_ITEM;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        aggregationCategory: "基本情報",
        itemName: "訪問日時",
        recordType: "support_activity",
        requirementLevel: "required",
        specialtyId: undefined,
      });
    });

    test("requirementLevel が不正なら 400 を返す", async () => {
      const response = await handleRequiredItemRequest(
        {
          body: JSON.stringify({
            aggregationCategory: "基本情報",
            itemName: "訪問日時",
            recordType: "support_activity",
            requirementLevel: "x",
          }),
          method: "POST",
          path: "/api/required-items",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });
});
