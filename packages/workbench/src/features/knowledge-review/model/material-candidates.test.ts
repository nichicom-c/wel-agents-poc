import { describe, expect, test } from "bun:test";

import {
  createMaterialCandidateFromComments,
  decideMaterialCandidateStatus,
  filterMaterialCandidates,
  type MaterialCandidate,
} from "./material-candidates.ts";

const BASE_CANDIDATES: MaterialCandidate[] = [
  {
    commentIds: ["comment-1"],
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: "author-a",
    difficultyId: "beginner",
    id: "candidate-1",
    learningThemeId: "assessment-basics",
    recordType: "support_activity",
    specialtyId: "maternal-child",
    status: "candidate",
    statusHistory: [],
    summary: "summary-1",
    title: "title-1",
  },
  {
    commentIds: ["comment-2"],
    createdAt: "2026-07-02T00:00:00.000Z",
    createdBy: "author-b",
    difficultyId: "advanced",
    id: "candidate-2",
    learningThemeId: "documentation",
    recordType: "general_record",
    specialtyId: "elderly-care",
    status: "approved",
    statusHistory: [],
    summary: "summary-2",
    title: "title-2",
  },
];

describe("filterMaterialCandidates", () => {
  test("フィルタ無しでは全件を返す", () => {
    expect(filterMaterialCandidates(BASE_CANDIDATES, {})).toHaveLength(2);
  });

  test("status で絞り込める", () => {
    const result = filterMaterialCandidates(BASE_CANDIDATES, {
      status: "approved",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("candidate-2");
  });

  test("specialtyId / recordType / learningThemeId / difficultyId を組み合わせて絞り込める", () => {
    const result = filterMaterialCandidates(BASE_CANDIDATES, {
      difficultyId: "beginner",
      learningThemeId: "assessment-basics",
      recordType: "support_activity",
      specialtyId: "maternal-child",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("candidate-1");
  });

  test("該当しない条件では空配列を返す", () => {
    const result = filterMaterialCandidates(BASE_CANDIDATES, {
      specialtyId: "mental-health",
    });
    expect(result).toHaveLength(0);
  });
});

describe("decideMaterialCandidateStatus", () => {
  test("指定した候補だけ status を更新し statusHistory に追記する", () => {
    const updated = decideMaterialCandidateStatus(
      BASE_CANDIDATES,
      "candidate-1",
      "approved",
      "reviewer-a",
    );

    const target = updated.find((candidate) => candidate.id === "candidate-1");
    expect(target?.status).toBe("approved");
    expect(target?.statusHistory).toHaveLength(1);
    expect(target?.statusHistory[0]).toMatchObject({
      changedBy: "reviewer-a",
      fromStatus: "candidate",
      toStatus: "approved",
    });

    const other = updated.find((candidate) => candidate.id === "candidate-2");
    expect(other?.status).toBe("approved");
    expect(other?.statusHistory).toHaveLength(0);
  });

  test("却下時は reasonCode を rejectionReasonCode に反映する", () => {
    const updated = decideMaterialCandidateStatus(
      BASE_CANDIDATES,
      "candidate-1",
      "rejected",
      "reviewer-a",
      { reasonCode: "duplicate_content", reasonText: "既存教材と重複" },
    );

    const target = updated.find((candidate) => candidate.id === "candidate-1");
    expect(target?.rejectionReasonCode).toBe("duplicate_content");
    expect(target?.statusHistory[0]?.reasonText).toBe("既存教材と重複");
  });

  test("却下以外への遷移では rejectionReasonCode を変更しない", () => {
    const rejected = decideMaterialCandidateStatus(
      BASE_CANDIDATES,
      "candidate-1",
      "rejected",
      "reviewer-a",
      { reasonCode: "other" },
    );
    const approved = decideMaterialCandidateStatus(
      rejected,
      "candidate-1",
      "needs_revision",
      "reviewer-a",
    );

    expect(
      approved.find((c) => c.id === "candidate-1")?.rejectionReasonCode,
    ).toBe("other");
  });
});

describe("createMaterialCandidateFromComments", () => {
  test("status: candidate で新規候補を末尾に追加する", () => {
    const updated = createMaterialCandidateFromComments(BASE_CANDIDATES, {
      commentIds: ["comment-3", "comment-4"],
      createdBy: "nurse-a",
      difficultyId: "intermediate",
      learningThemeId: "risk-detection",
      recordType: "summary",
      specialtyId: "public-health",
      summary: "new summary",
      title: "new title",
    });

    expect(updated).toHaveLength(3);
    const created = updated[updated.length - 1];
    expect(created?.status).toBe("candidate");
    expect(created?.commentIds).toEqual(["comment-3", "comment-4"]);
    expect(created?.statusHistory).toHaveLength(1);
    expect(created?.statusHistory[0]?.fromStatus).toBeNull();
    expect(typeof created?.id).toBe("string");
    expect(created?.id.length).toBeGreaterThan(0);
  });
});
