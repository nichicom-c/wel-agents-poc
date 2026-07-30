import { createId } from "./create-id.ts";

/** issue #8 由来の教材候補（承認済み）が採る形。教材の種類は暫定の3種類。 */
export const MATERIAL_TYPES = [
  "teaching_case",
  "comment_derived_note",
  "reference_summary",
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  comment_derived_note: "コメント由来のノート",
  reference_summary: "参照知識のまとめ",
  teaching_case: "演習ケース素材",
};

export function materialTypeLabel(materialType: MaterialType): string {
  return MATERIAL_TYPE_LABELS[materialType];
}

/** issue #10 の Acceptance Criteria が定義する教材の公開状態。 */
export const PUBLICATION_STATUSES = [
  "draft",
  "reviewing",
  "published",
  "archived",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  archived: "アーカイブ済み",
  draft: "下書き",
  published: "公開済み",
  reviewing: "レビュー中",
};

export function publicationStatusLabel(status: PublicationStatus): string {
  return PUBLICATION_STATUS_LABELS[status];
}

export type MaterialRevision = {
  fromStatus: PublicationStatus | null;
  toStatus: PublicationStatus;
  changedBy: string;
  changedAt: string;
};

export type Material = {
  id: string;
  materialType: MaterialType;
  title: string;
  publicationStatus: PublicationStatus;
  specialtyId: string;
  learningThemeId: string;
  difficultyId: string;
  createdBy: string;
  createdAt: string;
  revisions: MaterialRevision[];
};

export type MaterialFilters = {
  materialType?: MaterialType;
  publicationStatus?: PublicationStatus;
};

export function filterMaterials(
  materials: readonly Material[],
  filters: MaterialFilters,
): Material[] {
  return materials.filter(
    (material) =>
      (!filters.materialType ||
        material.materialType === filters.materialType) &&
      (!filters.publicationStatus ||
        material.publicationStatus === filters.publicationStatus),
  );
}

/** 公開状態を明示的な state として管理する（issue #10 の Technical Approach）。 */
export function changeMaterialPublicationStatus(
  materials: readonly Material[],
  id: string,
  nextStatus: PublicationStatus,
  changedBy: string,
): Material[] {
  return materials.map((material) => {
    if (material.id !== id) {
      return material;
    }
    return {
      ...material,
      publicationStatus: nextStatus,
      revisions: [
        ...material.revisions,
        {
          changedAt: new Date().toISOString(),
          changedBy,
          fromStatus: material.publicationStatus,
          toStatus: nextStatus,
        },
      ],
    };
  });
}

export type NewMaterialInput = {
  materialType: MaterialType;
  title: string;
  specialtyId: string;
  learningThemeId: string;
  difficultyId: string;
  createdBy: string;
};

/** 新規教材を status: draft で作る（issue #8 の教材候補承認や手動登録の受け口）。 */
export function createMaterial(
  materials: readonly Material[],
  input: NewMaterialInput,
): Material[] {
  const createdAt = new Date().toISOString();
  const created: Material = {
    createdAt,
    createdBy: input.createdBy,
    difficultyId: input.difficultyId,
    id: createId("material"),
    learningThemeId: input.learningThemeId,
    materialType: input.materialType,
    publicationStatus: "draft",
    revisions: [
      {
        changedAt: createdAt,
        changedBy: input.createdBy,
        fromStatus: null,
        toStatus: "draft",
      },
    ],
    specialtyId: input.specialtyId,
    title: input.title,
  };
  return [...materials, created];
}
