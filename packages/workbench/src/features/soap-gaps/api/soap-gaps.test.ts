import { describe, expect, test } from "bun:test";

import { postSoapGaps } from "./soap-gaps.ts";

const CANDIDATE = {
  category: "A" as const,
  draftText: "転倒リスクが高い。",
  evidenceQuote: "転倒リスクが高い",
  reasoning: "観察結果からの評価。",
  confidence: 0.8,
};

describe("postSoapGaps", () => {
  test("candidates を POST body に含めて呼ぶ", async () => {
    let capturedBody: unknown;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = JSON.parse(String(init?.body));
      return Response.json({
        gaps: [
          {
            gapType: "insufficient_reasoning",
            soapCategory: "A",
            targetItem: "転倒リスクが高い。",
            detail: "根拠となる S/O が見当たりません。",
            relatedEvidenceQuotes: ["転倒リスクが高い"],
            skippable: false,
          },
        ],
      });
    };

    const result = await postSoapGaps({ candidates: [CANDIDATE], fetchFn });

    expect(capturedBody).toEqual({ candidates: [CANDIDATE] });
    expect(result.gaps).toHaveLength(1);
  });

  test("candidates が空なら呼ばずに throw する", async () => {
    await expect(
      postSoapGaps({
        candidates: [],
        fetchFn: async () => {
          throw new Error("must not be called");
        },
      }),
    ).rejects.toThrow("candidates is required");
  });

  test("非 2xx は error メッセージを throw する", async () => {
    const fetchFn = async () =>
      Response.json({ error: "candidates is required" }, { status: 400 });

    await expect(
      postSoapGaps({ candidates: [CANDIDATE], fetchFn }),
    ).rejects.toThrow("candidates is required");
  });

  test("不正な gap（gapType 不正や必須項目欠落）は取り除く", async () => {
    const fetchFn = async () =>
      Response.json({
        gaps: [
          {
            gapType: "insufficient_reasoning",
            soapCategory: "A",
            targetItem: "ok",
            detail: "ok",
            relatedEvidenceQuotes: ["x"],
            skippable: false,
          },
          {
            gapType: "not_a_type",
            soapCategory: "A",
            targetItem: "x",
            detail: "x",
          },
          {
            gapType: "ambiguous",
            soapCategory: "A",
            targetItem: "",
            detail: "x",
          },
        ],
      });

    const result = await postSoapGaps({ candidates: [CANDIDATE], fetchFn });

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.targetItem).toBe("ok");
  });

  test("gaps が欠落/不正形式なら空配列にする", async () => {
    const fetchFn = async () => Response.json({});

    const result = await postSoapGaps({ candidates: [CANDIDATE], fetchFn });

    expect(result.gaps).toEqual([]);
  });
});
