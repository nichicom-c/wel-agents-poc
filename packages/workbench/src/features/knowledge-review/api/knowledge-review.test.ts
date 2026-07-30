import { describe, expect, test } from "bun:test";

import { listSoapRecords, listVersionsForRecord } from "./knowledge-review.ts";

describe("listSoapRecords", () => {
  test("BFF /api/soap-records を呼び、正しい形の record だけを返す", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({
        records: [
          {
            createdAt: "2026-07-30T00:00:00.000Z",
            createdBy: "11111111-1111-1111-1111-111111111111",
            id: "record-1",
            recordType: "support_activity",
            status: "finalized",
          },
          // recordType が不正な行は除外される。
          {
            createdAt: "2026-07-30T00:00:00.000Z",
            createdBy: "11111111-1111-1111-1111-111111111111",
            id: "record-2",
            recordType: "unknown",
            status: "finalized",
          },
        ],
      });
    };

    const result = await listSoapRecords(fetchFn);

    expect(requestedUrl).toBe("/api/soap-records");
    expect(result).toEqual([
      {
        createdAt: "2026-07-30T00:00:00.000Z",
        createdBy: "11111111-1111-1111-1111-111111111111",
        id: "record-1",
        recordType: "support_activity",
        status: "finalized",
      },
    ]);
  });

  test("response.ok が false ならエラーを投げる", async () => {
    const fetchFn = async () =>
      Response.json(
        { error: "training data store is not configured" },
        { status: 503 },
      );

    await expect(listSoapRecords(fetchFn)).rejects.toThrow(
      "training data store is not configured",
    );
  });
});

describe("listVersionsForRecord", () => {
  test("recordId を path に含めて BFF /api/soap-records/:id/versions を呼ぶ", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({
        versions: [
          {
            createdAt: "2026-07-30T00:00:00.000Z",
            createdBy: "11111111-1111-1111-1111-111111111111",
            id: "version-1",
            items: [{ category: "S", text: "s text" }],
            recordId: "record-1",
            source: "soap_draft_ai",
            versionNo: 1,
          },
        ],
      });
    };

    const result = await listVersionsForRecord("record-1", fetchFn);

    expect(requestedUrl).toBe("/api/soap-records/record-1/versions");
    expect(result).toEqual([
      {
        createdAt: "2026-07-30T00:00:00.000Z",
        createdBy: "11111111-1111-1111-1111-111111111111",
        id: "version-1",
        items: [{ category: "S", text: "s text" }],
        recordId: "record-1",
        source: "soap_draft_ai",
        versionNo: 1,
      },
    ]);
  });

  test("items が空、または不正な category を含む version は除外する", async () => {
    const fetchFn = async () =>
      Response.json({
        versions: [
          {
            createdAt: "2026-07-30T00:00:00.000Z",
            createdBy: "11111111-1111-1111-1111-111111111111",
            id: "version-1",
            items: [],
            recordId: "record-1",
            source: "soap_draft_ai",
            versionNo: 1,
          },
        ],
      });

    const result = await listVersionsForRecord("record-1", fetchFn);
    expect(result).toEqual([]);
  });
});
