import { describe, expect, test } from "bun:test";

import type { SoapDraftApiCandidate } from "../api/soap-draft.ts";
import {
  addManualCandidate,
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
  test("SOAP_CATEGORIES の順序で、S/O/A/P は候補が0件でも常に含める", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);
    const groups = groupByCategory(candidates);

    expect(groups.map((g) => g.category)).toEqual(["S", "O", "A", "P"]);
    expect(groups[0]?.candidates).toHaveLength(1);
  });

  test("候補が無い S/A/P は空配列を持つ", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);
    const groups = groupByCategory(candidates);

    for (const category of ["A", "P"] as const) {
      const group = groups.find((g) => g.category === category);
      expect(group).toBeDefined();
      expect(group?.candidates).toHaveLength(0);
    }
  });

  test("UNCLASSIFIED は候補が0件ならセクションごと含めない", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);
    const groups = groupByCategory(candidates);

    expect(groups.find((g) => g.category === "UNCLASSIFIED")).toBeUndefined();
  });

  test("UNCLASSIFIED の候補があるときは含める", () => {
    const candidates = fromApiCandidates([
      ...API_CANDIDATES,
      {
        category: "UNCLASSIFIED",
        draftText: "unclassified candidate",
        evidenceQuote: "u evidence",
        reasoning: "r",
        confidence: 0.5,
      },
    ]);
    const groups = groupByCategory(candidates);

    const unclassified = groups.find((g) => g.category === "UNCLASSIFIED");
    expect(unclassified?.candidates).toHaveLength(1);
  });
});

describe("addManualCandidate", () => {
  test("id を採番し status を adopted にして末尾へ追加する", () => {
    const candidates = fromApiCandidates(API_CANDIDATES);
    const updated = addManualCandidate(candidates, {
      category: "P",
      draftText: "利用者からの回答",
      evidenceQuote: "利用者からの回答",
      reasoning: "不足確認への回答として追加。",
      confidence: 1,
    });

    expect(updated).toHaveLength(candidates.length + 1);
    const added = updated[updated.length - 1];
    expect(added?.status).toBe("adopted");
    expect(added?.draftText).toBe("利用者からの回答");
    expect(typeof added?.id).toBe("string");
    expect(added?.id.length).toBeGreaterThan(0);
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
