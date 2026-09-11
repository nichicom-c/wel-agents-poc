import { describe, expect, test } from "bun:test";

import type { Gap } from "../contracts/soap-gaps.ts";
import {
  getSoapGapsChatCandidates,
  getSoapGapsChatGap,
  getSoapGapsChatMessage,
  isSoapGapsChatRequest,
} from "./soap-gaps-chat.ts";

const VALID_GAP: Gap = {
  gapType: "insufficient_reasoning",
  soapCategory: "A",
  targetItem: "転倒リスクが高い。",
  detail: "アセスメントの根拠が不足しています。",
  relatedEvidenceQuotes: ["転倒リスクが高い"],
  skippable: false,
};

describe("isSoapGapsChatRequest", () => {
  test("type: soap_gaps_chat のときだけ true", () => {
    expect(isSoapGapsChatRequest({ type: "soap_gaps_chat" })).toBe(true);
    expect(isSoapGapsChatRequest({})).toBe(false);
    expect(isSoapGapsChatRequest({ type: "soap_gaps" })).toBe(false);
  });
});

describe("getSoapGapsChatGap", () => {
  test("有効な gap を返す", () => {
    expect(getSoapGapsChatGap({ gap: VALID_GAP })).toEqual(VALID_GAP);
  });

  test("欠落・不正な形状は undefined", () => {
    expect(getSoapGapsChatGap({})).toBeUndefined();
    expect(
      getSoapGapsChatGap({ gap: { ...VALID_GAP, gapType: "unknown" } }),
    ).toBeUndefined();
    expect(
      getSoapGapsChatGap({ gap: { ...VALID_GAP, relatedEvidenceQuotes: [] } }),
    ).toBeUndefined();
    expect(
      getSoapGapsChatGap({ gap: { ...VALID_GAP, skippable: "false" } }),
    ).toBeUndefined();
  });
});

describe("getSoapGapsChatMessage", () => {
  test("非空文字列は trim して返す。無ければ undefined", () => {
    expect(getSoapGapsChatMessage({ message: " こんにちは " })).toBe(
      "こんにちは",
    );
    expect(getSoapGapsChatMessage({})).toBeUndefined();
    expect(getSoapGapsChatMessage({ message: "   " })).toBeUndefined();
  });
});

describe("getSoapGapsChatCandidates", () => {
  test("domain/soap-gaps.ts の getSoapGapsCandidates を再利用する", () => {
    const candidates = [
      {
        category: "S" as const,
        draftText: "x",
        evidenceQuote: "x",
        reasoning: "x",
        confidence: 0.5,
      },
    ];
    expect(getSoapGapsChatCandidates({ candidates })).toEqual(candidates);
    expect(getSoapGapsChatCandidates({})).toBeUndefined();
  });
});
