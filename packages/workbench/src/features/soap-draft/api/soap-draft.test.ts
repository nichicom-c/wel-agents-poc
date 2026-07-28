import { describe, expect, test } from "bun:test";

import { postSoapDraft } from "./soap-draft.ts";

describe("postSoapDraft", () => {
  test("text だけを POST body に含めて呼ぶ", async () => {
    let capturedBody: unknown;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = JSON.parse(String(init?.body));
      return Response.json({
        candidates: [
          {
            category: "S",
            draftText: "draft",
            evidenceQuote: "evidence",
            reasoning: "reason",
            confidence: 0.8,
          },
        ],
        recommendedRecordTypes: ["support_activity", "summary"],
      });
    };

    const result = await postSoapDraft({
      text: "  最近眠れていない  ",
      fetchFn,
    });

    expect(capturedBody).toEqual({ text: "最近眠れていない" });
    expect(result).toEqual({
      candidates: [
        {
          category: "S",
          draftText: "draft",
          evidenceQuote: "evidence",
          reasoning: "reason",
          confidence: 0.8,
        },
      ],
      recommendedRecordTypes: ["support_activity", "summary"],
    });
  });

  test("空文字は呼ばずに throw する", async () => {
    await expect(
      postSoapDraft({
        text: "   ",
        fetchFn: async () => {
          throw new Error("must not be called");
        },
      }),
    ).rejects.toThrow("text is required");
  });

  test("非 2xx は error メッセージを throw する", async () => {
    const fetchFn = async () =>
      Response.json({ error: "text is required" }, { status: 400 });

    await expect(postSoapDraft({ text: "x", fetchFn })).rejects.toThrow(
      "text is required",
    );
  });

  test("不正な候補（draftText/evidenceQuote 欠落や不正 category）は取り除く", async () => {
    const fetchFn = async () =>
      Response.json({
        candidates: [
          {
            category: "S",
            draftText: "ok",
            evidenceQuote: "ok",
            reasoning: "r",
            confidence: 0.5,
          },
          { category: "X", draftText: "bad category", evidenceQuote: "x" },
          { category: "O", draftText: "", evidenceQuote: "x" },
        ],
        recommendedRecordTypes: [],
      });

    const result = await postSoapDraft({ text: "x", fetchFn });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.draftText).toBe("ok");
  });

  test("recommendedRecordTypes に不正な値が混ざっていれば取り除く", async () => {
    const fetchFn = async () =>
      Response.json({
        candidates: [],
        recommendedRecordTypes: ["support_activity", "not_a_type", 123],
      });

    const result = await postSoapDraft({ text: "x", fetchFn });

    expect(result.recommendedRecordTypes).toEqual(["support_activity"]);
  });

  test("recommendedRecordTypes が欠落/不正形式なら空配列にする", async () => {
    const fetchFn = async () => Response.json({ candidates: [] });

    const result = await postSoapDraft({ text: "x", fetchFn });

    expect(result.recommendedRecordTypes).toEqual([]);
  });
});
