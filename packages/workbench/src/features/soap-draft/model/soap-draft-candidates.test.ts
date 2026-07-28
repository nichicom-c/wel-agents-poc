import { describe, expect, test } from "bun:test";

import type { SoapDraftApiCandidate } from "../api/soap-draft.ts";
import {
  confidenceTier,
  fromApiCandidates,
  groupByCategory,
  withEditedText,
  withStatus,
} from "./soap-draft-candidates.ts";

const API_CANDIDATES: SoapDraftApiCandidate[] = [
  {
    category: "S",
    draftText: "S candidate",
    evidenceQuote: "s evidence",
    reasoning: "r",
    confidence: 0.8,
  },
  {
    category: "O",
    draftText: "O candidate",
    evidenceQuote: "o evidence",
    reasoning: "r",
    confidence: 0.3,
  },
];

describe("fromApiCandidates", () => {
  test("id と既定 status(pending) を付与する", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);

    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(typeof candidate.id).toBe("string");
      expect(candidate.id.length).toBeGreaterThan(0);
      expect(candidate.status).toBe("pending");
    }
    expect(candidates[0]?.draftText).toBe("S candidate");
  });

  test("各候補に異なる id を割り当てる", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);
    expect(candidates[0]?.id).not.toBe(candidates[1]?.id);
  });
});

describe("withStatus / withEditedText", () => {
  test("指定した候補だけ status を更新する", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);
    const targetId = candidates[0]?.id ?? "";
    const updated = withStatus(candidates, targetId, "adopted");

    expect(updated.find((c) => c.id === targetId)?.status).toBe("adopted");
    expect(updated.find((c) => c.id !== targetId)?.status).toBe("pending");
  });

  test("指定した候補の draftText を編集し status を edited にする", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);
    const targetId = candidates[0]?.id ?? "";
    const updated = withEditedText(candidates, targetId, "edited text");

    const edited = updated.find((c) => c.id === targetId);
    expect(edited?.draftText).toBe("edited text");
    expect(edited?.status).toBe("edited");
  });
});

describe("groupByCategory", () => {
  test("カテゴリごとにまとめ、候補がないカテゴリは含めない", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);
    const groups = groupByCategory(candidates);

    expect(groups.map((g) => g.category)).toEqual(["S", "O"]);
    expect(groups[0]?.candidates).toHaveLength(1);
  });
});

describe("confidenceTier", () => {
  test("閾値どおりに high/medium/low を返す", () => {
    expect(confidenceTier(0.9)).toBe("high");
    expect(confidenceTier(0.7)).toBe("high");
    expect(confidenceTier(0.5)).toBe("medium");
    expect(confidenceTier(0.4)).toBe("medium");
    expect(confidenceTier(0.2)).toBe("low");
  });
});
