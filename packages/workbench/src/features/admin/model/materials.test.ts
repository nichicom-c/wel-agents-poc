import { describe, expect, test } from "bun:test";

import {
  changeMaterialPublicationStatus,
  createMaterial,
  filterMaterials,
  type Material,
} from "./materials.ts";

const BASE_MATERIALS: Material[] = [
  {
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: "author-a",
    difficultyId: "beginner",
    id: "material-1",
    learningThemeId: "documentation",
    materialType: "teaching_case",
    publicationStatus: "draft",
    revisions: [],
    specialtyId: "maternal-child",
    title: "title-1",
  },
  {
    createdAt: "2026-07-02T00:00:00.000Z",
    createdBy: "author-b",
    difficultyId: "advanced",
    id: "material-2",
    learningThemeId: "risk-detection",
    materialType: "reference_summary",
    publicationStatus: "published",
    revisions: [],
    specialtyId: "elderly-care",
    title: "title-2",
  },
];

describe("filterMaterials", () => {
  test("フィルタ無しでは全件を返す", () => {
    expect(filterMaterials(BASE_MATERIALS, {})).toHaveLength(2);
  });

  test("materialType / publicationStatus で絞り込める", () => {
    const result = filterMaterials(BASE_MATERIALS, {
      materialType: "teaching_case",
      publicationStatus: "draft",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("material-1");
  });
});

describe("changeMaterialPublicationStatus", () => {
  test("指定した教材だけ状態を更新し revisions に追記する", () => {
    const updated = changeMaterialPublicationStatus(
      BASE_MATERIALS,
      "material-1",
      "reviewing",
      "reviewer-a",
    );

    const target = updated.find((material) => material.id === "material-1");
    expect(target?.publicationStatus).toBe("reviewing");
    expect(target?.revisions).toHaveLength(1);
    expect(target?.revisions[0]).toMatchObject({
      changedBy: "reviewer-a",
      fromStatus: "draft",
      toStatus: "reviewing",
    });

    const other = updated.find((material) => material.id === "material-2");
    expect(other?.publicationStatus).toBe("published");
    expect(other?.revisions).toHaveLength(0);
  });
});

describe("createMaterial", () => {
  test("status: draft で新規教材を末尾に追加する", () => {
    const updated = createMaterial(BASE_MATERIALS, {
      createdBy: "nurse-a",
      difficultyId: "intermediate",
      learningThemeId: "assessment-basics",
      materialType: "comment_derived_note",
      specialtyId: "public-health",
      title: "new title",
    });

    expect(updated).toHaveLength(3);
    const created = updated[updated.length - 1];
    expect(created?.publicationStatus).toBe("draft");
    expect(created?.revisions).toHaveLength(1);
    expect(created?.revisions[0]?.fromStatus).toBeNull();
  });
});
