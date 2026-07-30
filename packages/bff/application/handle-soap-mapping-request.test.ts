import { describe, expect, test } from "bun:test";

import {
  type HandleSoapMappingOptions,
  handleSoapMappingRequest,
} from "./handle-soap-mapping-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const SAMPLE_VERSION = {
  createdBy: AUTH_CONTEXT.userId,
  effectiveFrom: "2026-07-15T00:00:00.000Z",
  id: "mapping-1",
  isCurrent: true,
  mappingDefinition: { A: "a", O: "o", P: "p", S: "s" },
  recordType: "support_activity" as const,
  versionNo: 1,
};

function baseOptions(
  overrides: Partial<HandleSoapMappingOptions> = {},
): HandleSoapMappingOptions {
  return {
    authContext: AUTH_CONTEXT,
    createVersion: async () => [SAMPLE_VERSION],
    listVersions: async () => [SAMPLE_VERSION],
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleSoapMappingRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleSoapMappingRequest(
      { method: "OPTIONS", path: "/api/soap-mapping-versions" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleSoapMappingRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleSoapMappingRequest(
      {
        method: "GET",
        path: "/api/soap-mapping-versions",
        query: { recordType: "support_activity" },
      },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleSoapMappingRequest(
      {
        method: "GET",
        path: "/api/soap-mapping-versions",
        query: { recordType: "support_activity" },
      },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("GET /api/soap-mapping-versions", () => {
    test("recordType を渡して versions を返す", async () => {
      let capturedInput: unknown;
      const response = await handleSoapMappingRequest(
        {
          method: "GET",
          path: "/api/soap-mapping-versions",
          query: { recordType: "support_activity" },
        },
        baseOptions({
          listVersions: async (input) => {
            capturedInput = input;
            return [SAMPLE_VERSION];
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({ recordType: "support_activity" });
    });

    test("recordType が無ければ 400 を返す", async () => {
      const response = await handleSoapMappingRequest(
        { method: "GET", path: "/api/soap-mapping-versions" },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/soap-mapping-versions", () => {
    test("有効な body で新規バージョンを作り、authContext から createdBy を使う", async () => {
      let capturedInput: unknown;
      const response = await handleSoapMappingRequest(
        {
          body: JSON.stringify({
            mappingDefinition: { A: "a", O: "o", P: "p", S: "s" },
            recordType: "support_activity",
          }),
          method: "POST",
          path: "/api/soap-mapping-versions",
        },
        baseOptions({
          createVersion: async (input) => {
            capturedInput = input;
            return [SAMPLE_VERSION];
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        createdBy: AUTH_CONTEXT.userId,
        createdByDisplayName: AUTH_CONTEXT.displayName,
        mappingDefinition: { A: "a", O: "o", P: "p", S: "s" },
        recordType: "support_activity",
      });
    });

    test("mappingDefinition のカテゴリが欠けていたら 400 を返す", async () => {
      const response = await handleSoapMappingRequest(
        {
          body: JSON.stringify({
            mappingDefinition: { A: "a", O: "o", P: "" },
            recordType: "support_activity",
          }),
          method: "POST",
          path: "/api/soap-mapping-versions",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });
});
