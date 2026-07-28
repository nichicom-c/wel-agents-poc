import { describe, expect, test } from "bun:test";

import {
  type SoapDraftCandidate,
  type SoapDraftOutput,
  soapDraftCandidateSchema,
  soapDraftOutputSchema,
} from "./soap-draft.ts";

const VALID_CANDIDATE: SoapDraftCandidate = {
  category: "S",
  draftText: "利用者は最近眠れていないと話した。",
  evidenceQuote: "最近眠れていない",
  reasoning: "利用者本人の発言のため主観的情報とした。",
  confidence: 0.8,
};

describe("soapDraftCandidateSchema", () => {
  test("有効な候補を parse できる", () => {
    expect(soapDraftCandidateSchema.parse(VALID_CANDIDATE)).toEqual(
      VALID_CANDIDATE,
    );
  });

  test("UNCLASSIFIED も有効なカテゴリとして受け付ける", () => {
    expect(
      soapDraftCandidateSchema.safeParse({
        ...VALID_CANDIDATE,
        category: "UNCLASSIFIED",
      }).success,
    ).toBe(true);
  });

  test("不正な category は失敗する", () => {
    expect(
      soapDraftCandidateSchema.safeParse({ ...VALID_CANDIDATE, category: "X" })
        .success,
    ).toBe(false);
  });

  test("空の evidenceQuote は失敗する", () => {
    expect(
      soapDraftCandidateSchema.safeParse({
        ...VALID_CANDIDATE,
        evidenceQuote: "",
      }).success,
    ).toBe(false);
  });

  test("confidence が範囲外だと失敗する", () => {
    expect(
      soapDraftCandidateSchema.safeParse({
        ...VALID_CANDIDATE,
        confidence: 1.5,
      }).success,
    ).toBe(false);
    expect(
      soapDraftCandidateSchema.safeParse({
        ...VALID_CANDIDATE,
        confidence: -0.1,
      }).success,
    ).toBe(false);
  });
});

describe("soapDraftOutputSchema", () => {
  test("candidates と入力全体の recommendedRecordTypes を parse できる", () => {
    const output: SoapDraftOutput = {
      candidates: [VALID_CANDIDATE],
      recommendedRecordTypes: ["support_activity", "summary"],
    };
    expect(soapDraftOutputSchema.parse(output)).toEqual(output);
  });

  test("candidates / recommendedRecordTypes とも空配列で有効", () => {
    expect(
      soapDraftOutputSchema.safeParse({
        candidates: [],
        recommendedRecordTypes: [],
      }).success,
    ).toBe(true);
  });

  test("recommendedRecordTypes に不正な記録種別があると失敗する", () => {
    expect(
      soapDraftOutputSchema.safeParse({
        candidates: [VALID_CANDIDATE],
        recommendedRecordTypes: ["not_a_record_type"],
      }).success,
    ).toBe(false);
  });

  test("recommendedRecordTypes 欠落は失敗する", () => {
    expect(soapDraftOutputSchema.safeParse({ candidates: [] }).success).toBe(
      false,
    );
  });
});
