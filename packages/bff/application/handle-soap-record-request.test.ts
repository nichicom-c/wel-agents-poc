import { describe, expect, test } from "bun:test";

import {
  type HandleSoapRecordOptions,
  handleSoapRecordRequest,
} from "./handle-soap-record-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

function baseOptions(
  overrides: Partial<HandleSoapRecordOptions> = {},
): HandleSoapRecordOptions {
  return {
    authContext: AUTH_CONTEXT,
    createRecordVersion: async () => ({
      recordId: "record-1",
      versionId: "version-1",
      versionNo: 1,
    }),
    listRecords: async () => [],
    listVersions: async () => [],
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleSoapRecordRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleSoapRecordRequest(
      { method: "OPTIONS", path: "/api/soap-records" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleSoapRecordRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleSoapRecordRequest(
      { method: "GET", path: "/api/soap-records" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleSoapRecordRequest(
      { method: "GET", path: "/api/soap-records" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("POST /api/soap-records", () => {
    test("有効な body で新規記録を作り、authContext.userId を createdBy に使う", async () => {
      let capturedInput: unknown;
      const response = await handleSoapRecordRequest(
        {
          body: JSON.stringify({
            items: [{ category: "S", text: "s text" }],
            recordType: "support_activity",
          }),
          method: "POST",
          path: "/api/soap-records",
        },
        baseOptions({
          createRecordVersion: async (input) => {
            capturedInput = input;
            return {
              recordId: "record-1",
              versionId: "version-1",
              versionNo: 1,
            };
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        recordId: "record-1",
        versionId: "version-1",
        versionNo: 1,
      });
      expect(capturedInput).toEqual({
        createdBy: AUTH_CONTEXT.userId,
        createdByDisplayName: AUTH_CONTEXT.displayName,
        items: [{ category: "S", text: "s text" }],
        recordId: undefined,
        recordType: "support_activity",
        source: "soap_draft_ai",
      });
    });

    test("recordId を渡すとそのまま createRecordVersion に渡す", async () => {
      let capturedRecordId: string | undefined;
      await handleSoapRecordRequest(
        {
          body: JSON.stringify({
            items: [{ category: "S", text: "s text" }],
            recordId: "record-existing",
            recordType: "support_activity",
            source: "manual",
          }),
          method: "POST",
          path: "/api/soap-records",
        },
        baseOptions({
          createRecordVersion: async (input) => {
            capturedRecordId = input.recordId;
            expect(input.source).toBe("manual");
            return {
              recordId: "record-existing",
              versionId: "version-2",
              versionNo: 2,
            };
          },
        }),
      );

      expect(capturedRecordId).toBe("record-existing");
    });

    test("recordType が不正なら 400 を返す", async () => {
      const response = await handleSoapRecordRequest(
        {
          body: JSON.stringify({
            items: [{ category: "S", text: "s" }],
            recordType: "x",
          }),
          method: "POST",
          path: "/api/soap-records",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("items が空配列なら 400 を返す", async () => {
      const response = await handleSoapRecordRequest(
        {
          body: JSON.stringify({ items: [], recordType: "support_activity" }),
          method: "POST",
          path: "/api/soap-records",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("item.category が不正なら 400 を返す", async () => {
      const response = await handleSoapRecordRequest(
        {
          body: JSON.stringify({
            items: [{ category: "X", text: "s" }],
            recordType: "support_activity",
          }),
          method: "POST",
          path: "/api/soap-records",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("createRecordVersion が例外を投げたら 502 を返す", async () => {
      const response = await handleSoapRecordRequest(
        {
          body: JSON.stringify({
            items: [{ category: "S", text: "s" }],
            recordType: "support_activity",
          }),
          method: "POST",
          path: "/api/soap-records",
        },
        baseOptions({
          createRecordVersion: async () => {
            throw new Error("boom");
          },
        }),
      );
      expect(response.statusCode).toBe(502);
    });
  });

  describe("GET /api/soap-records", () => {
    test("records 一覧を返す", async () => {
      const response = await handleSoapRecordRequest(
        { method: "GET", path: "/api/soap-records" },
        baseOptions({
          listRecords: async () => [
            {
              createdAt: "2026-07-30T00:00:00.000Z",
              createdBy: AUTH_CONTEXT.userId,
              id: "record-1",
              recordType: "support_activity",
              status: "finalized",
            },
          ],
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).records).toHaveLength(1);
    });
  });

  describe("GET /api/soap-records/:recordId/versions", () => {
    test("指定した recordId の versions を返す", async () => {
      let capturedRecordId: string | undefined;
      const response = await handleSoapRecordRequest(
        { method: "GET", path: "/api/soap-records/record-1/versions" },
        baseOptions({
          listVersions: async (input) => {
            capturedRecordId = input.recordId;
            return [
              {
                createdAt: "2026-07-30T00:00:00.000Z",
                createdBy: AUTH_CONTEXT.userId,
                id: "version-1",
                items: [{ category: "S", text: "s" }],
                recordId: "record-1",
                source: "soap_draft_ai",
                versionNo: 1,
              },
            ];
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedRecordId).toBe("record-1");
      expect(JSON.parse(response.body).versions).toHaveLength(1);
    });
  });
});
