import { describe, expect, test } from "bun:test";

import { createRubric, type Rubric, setRubricReviewStatus } from "./rubrics.ts";

const BASE_RUBRICS: Rubric[] = [
  {
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: "author-a",
    id: "rubric-1",
    items: [],
    name: "rubric-1",
    reviewStatus: "expert_review_required",
    targetType: "exercise_feedback",
    versionNo: 1,
  },
];

describe("setRubricReviewStatus", () => {
  test("指定したルーブリックだけ確認状態を更新する", () => {
    const updated = setRubricReviewStatus(
      BASE_RUBRICS,
      "rubric-1",
      "confirmed",
    );
    expect(updated.find((r) => r.id === "rubric-1")?.reviewStatus).toBe(
      "confirmed",
    );
  });

  test("確認済みから未確認へも戻せる（demo 用の双方向遷移）", () => {
    const confirmed = setRubricReviewStatus(
      BASE_RUBRICS,
      "rubric-1",
      "confirmed",
    );
    const reverted = setRubricReviewStatus(
      confirmed,
      "rubric-1",
      "expert_review_required",
    );
    expect(reverted.find((r) => r.id === "rubric-1")?.reviewStatus).toBe(
      "expert_review_required",
    );
  });
});

describe("createRubric", () => {
  test("reviewStatus: expert_review_required で新規ルーブリックを作る", () => {
    const updated = createRubric(BASE_RUBRICS, {
      createdBy: "nurse-a",
      name: "new rubric",
      targetType: "material_review",
    });

    const created = updated[updated.length - 1];
    expect(created?.reviewStatus).toBe("expert_review_required");
    expect(created?.versionNo).toBe(1);
    expect(created?.items).toHaveLength(0);
  });
});
