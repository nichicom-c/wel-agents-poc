import { describe, expect, test } from "bun:test";

import { postSoapRecord } from "./soap-records.ts";

describe("postSoapRecord", () => {
  test("recordId 省略時は body に含めずに POST する", async () => {
    let capturedBody: unknown;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = JSON.parse(String(init?.body));
      return Response.json({
        recordId: "record-1",
        versionId: "version-1",
        versionNo: 1,
      });
    };

    const result = await postSoapRecord({
      fetchFn,
      items: [{ category: "S", text: "s text" }],
      recordType: "support_activity",
      source: "soap_draft_ai",
    });

    expect(capturedBody).toEqual({
      items: [{ category: "S", text: "s text" }],
      recordType: "support_activity",
      source: "soap_draft_ai",
    });
    expect(result).toEqual({
      recordId: "record-1",
      versionId: "version-1",
      versionNo: 1,
    });
  });

  test("recordId を渡すと body に含める", async () => {
    let capturedBody: unknown;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = JSON.parse(String(init?.body));
      return Response.json({
        recordId: "record-1",
        versionId: "version-2",
        versionNo: 2,
      });
    };

    await postSoapRecord({
      fetchFn,
      items: [{ category: "S", text: "s text" }],
      recordId: "record-1",
      recordType: "support_activity",
      source: "manual",
    });

    expect(capturedBody).toEqual({
      items: [{ category: "S", text: "s text" }],
      recordId: "record-1",
      recordType: "support_activity",
      source: "manual",
    });
  });

  test("items が空なら呼ばずに throw する", async () => {
    await expect(
      postSoapRecord({
        items: [],
        recordType: "support_activity",
        source: "manual",
      }),
    ).rejects.toThrow("items is required");
  });

  test("response.ok が false ならエラーメッセージを投げる", async () => {
    const fetchFn = async () =>
      Response.json(
        { error: "training data store is not configured" },
        { status: 503 },
      );

    await expect(
      postSoapRecord({
        fetchFn,
        items: [{ category: "S", text: "s" }],
        recordType: "support_activity",
        source: "manual",
      }),
    ).rejects.toThrow("training data store is not configured");
  });
});
