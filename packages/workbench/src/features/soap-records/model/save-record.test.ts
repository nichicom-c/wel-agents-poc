import { describe, expect, test } from "bun:test";

import type { SoapDraftCandidate } from "../../soap-draft/index.ts";
import {
  savableItemsFromCandidates,
  withSavedRecordId,
} from "./save-record.ts";

describe("withSavedRecordId", () => {
  test("指定した記録種別だけを更新し、他は保持する", () => {
    const updated = withSavedRecordId(
      { general_record: "record-existing" },
      "support_activity",
      "record-new",
    );

    expect(updated).toEqual({
      general_record: "record-existing",
      support_activity: "record-new",
    });
  });

  test("同じ記録種別を上書きできる", () => {
    const updated = withSavedRecordId(
      { support_activity: "record-old" },
      "support_activity",
      "record-new",
    );

    expect(updated.support_activity).toBe("record-new");
  });
});

describe("savableItemsFromCandidates", () => {
  const CANDIDATES: SoapDraftCandidate[] = [
    {
      category: "S",
      confidence: 0.9,
      draftText: "adopted text",
      evidenceQuote: "evidence",
      id: "1",
      reasoning: "r",
      status: "adopted",
    },
    {
      category: "O",
      confidence: 0.8,
      draftText: "edited text",
      evidenceQuote: "evidence",
      id: "2",
      reasoning: "r",
      status: "edited",
    },
    {
      category: "A",
      confidence: 0.5,
      draftText: "rejected text",
      evidenceQuote: "evidence",
      id: "3",
      reasoning: "r",
      status: "rejected",
    },
    {
      category: "P",
      confidence: 0.3,
      draftText: "deferred text",
      evidenceQuote: "evidence",
      id: "4",
      reasoning: "r",
      status: "deferred",
    },
    {
      category: "P",
      confidence: 0.3,
      draftText: "pending text",
      evidenceQuote: "evidence",
      id: "5",
      reasoning: "r",
      status: "pending",
    },
  ];

  test("adopted/edited だけを対象にする", () => {
    expect(savableItemsFromCandidates(CANDIDATES)).toEqual([
      { category: "S", text: "adopted text" },
      { category: "O", text: "edited text" },
    ]);
  });

  test("対象が無ければ空配列を返す", () => {
    expect(savableItemsFromCandidates(CANDIDATES.slice(2))).toEqual([]);
  });
});
