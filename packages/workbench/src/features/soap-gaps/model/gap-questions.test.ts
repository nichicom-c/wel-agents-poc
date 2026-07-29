import { describe, expect, test } from "bun:test";

import type { GapQuestionApiItem } from "../api/soap-gaps.ts";
import {
  fromApiQuestions,
  markAnswered,
  markSkipped,
  withDraftAnswer,
  withDraftSkipReason,
} from "./gap-questions.ts";

const API_QUESTIONS: GapQuestionApiItem[] = [
  {
    gapType: "insufficient_reasoning",
    soapCategory: "A",
    targetItem: "転倒リスクが高い。",
    questionText: "転倒リスクの根拠となる様子はありましたか？",
    skippable: false,
  },
  {
    gapType: "ambiguous",
    soapCategory: "S",
    targetItem: "しばらく様子を見る。",
    questionText: "「しばらく」とは具体的にどの程度の期間ですか？",
    skippable: true,
  },
];

describe("fromApiQuestions", () => {
  test("id / status(pending) / 空の draft を付与する", () => {
    const items = fromApiQuestions(API_QUESTIONS);

    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.status).toBe("pending");
      expect(item.answerText).toBe("");
      expect(item.skipReason).toBe("");
    }
  });

  test("各質問に異なる id を割り当てる", () => {
    const items = fromApiQuestions(API_QUESTIONS);
    expect(items[0]?.id).not.toBe(items[1]?.id);
  });
});

describe("withDraftAnswer / markAnswered", () => {
  test("指定した質問だけ answerText を更新し、markAnswered で status を answered にする", () => {
    const items = fromApiQuestions(API_QUESTIONS);
    const targetId = items[0]?.id ?? "";

    const drafted = withDraftAnswer(items, targetId, "落ち着いていた");
    expect(drafted.find((i) => i.id === targetId)?.answerText).toBe(
      "落ち着いていた",
    );
    expect(drafted.find((i) => i.id === targetId)?.status).toBe("pending");

    const answered = markAnswered(drafted, targetId);
    expect(answered.find((i) => i.id === targetId)?.status).toBe("answered");
    expect(answered.find((i) => i.id !== targetId)?.status).toBe("pending");
  });
});

describe("withDraftSkipReason / markSkipped", () => {
  test("指定した質問だけ skipReason を更新し、markSkipped で status を skipped にする", () => {
    const items = fromApiQuestions(API_QUESTIONS);
    const targetId = items[1]?.id ?? "";

    const drafted = withDraftSkipReason(items, targetId, "対象外のため");
    expect(drafted.find((i) => i.id === targetId)?.skipReason).toBe(
      "対象外のため",
    );

    const skipped = markSkipped(drafted, targetId);
    expect(skipped.find((i) => i.id === targetId)?.status).toBe("skipped");
    expect(skipped.find((i) => i.id !== targetId)?.status).toBe("pending");
  });
});
