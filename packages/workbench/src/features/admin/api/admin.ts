import type { SoapRecordType } from "../../soap-draft/index.ts";
import {
  changeMaterialPublicationStatus,
  createMaterial,
  filterMaterials,
  type Material,
  type MaterialFilters,
  type NewMaterialInput,
  type PublicationStatus,
} from "../model/materials.ts";
import type { ReferenceKnowledge } from "../model/reference-knowledge.ts";
import {
  createRequiredItem,
  filterRequiredItems,
  type NewRequiredItemInput,
  type RequiredItemFilters,
  type RequiredRecommendedItem,
} from "../model/required-items.ts";
import {
  createRubric,
  type NewRubricInput,
  type Rubric,
  type RubricReviewStatus,
  setRubricReviewStatus,
} from "../model/rubrics.ts";
import {
  createSoapMappingVersion,
  type MappingDefinition,
  type SoapMappingVersion,
  versionsForRecordType,
} from "../model/soap-mapping.ts";

/**
 * `terraform/aws/bff` に Aurora 等の実データストアはまだ無いため、issue #10 の管理画面 UI を
 * dummy データで先行実装する。`knowledge-review/api/knowledge-review.ts` と同じ方針で、
 * module 内変数を DB の代わりに使う。ブラウザを再読み込みすると内容はリセットされる。
 */

let materials: Material[] = [
  {
    createdAt: "2026-07-20T09:00:00.000Z",
    createdBy: "鈴木 reviewer",
    difficultyId: "beginner",
    id: "material-1",
    learningThemeId: "documentation",
    materialType: "comment_derived_note",
    publicationStatus: "reviewing",
    revisions: [
      {
        changedAt: "2026-07-20T09:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: null,
        toStatus: "draft",
      },
      {
        changedAt: "2026-07-21T09:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: "draft",
        toStatus: "reviewing",
      },
    ],
    specialtyId: "elderly-care",
    title: "O から A への飛躍を防ぐ中間観察の書き方",
  },
  {
    createdAt: "2026-07-05T09:00:00.000Z",
    createdBy: "管理者（デモ）",
    difficultyId: "intermediate",
    id: "material-2",
    learningThemeId: "assessment-basics",
    materialType: "teaching_case",
    publicationStatus: "published",
    revisions: [
      {
        changedAt: "2026-07-05T09:00:00.000Z",
        changedBy: "管理者（デモ）",
        fromStatus: null,
        toStatus: "draft",
      },
      {
        changedAt: "2026-07-08T09:00:00.000Z",
        changedBy: "管理者（デモ）",
        fromStatus: "draft",
        toStatus: "reviewing",
      },
      {
        changedAt: "2026-07-10T09:00:00.000Z",
        changedBy: "管理者（デモ）",
        fromStatus: "reviewing",
        toStatus: "published",
      },
    ],
    specialtyId: "maternal-child",
    title: "母子訪問での疲労蓄積アセスメント演習（例）",
  },
  {
    createdAt: "2026-07-24T09:00:00.000Z",
    createdBy: "田中 professional",
    difficultyId: "advanced",
    id: "material-3",
    learningThemeId: "risk-detection",
    materialType: "reference_summary",
    publicationStatus: "draft",
    revisions: [
      {
        changedAt: "2026-07-24T09:00:00.000Z",
        changedBy: "田中 professional",
        fromStatus: null,
        toStatus: "draft",
      },
    ],
    specialtyId: "mental-health",
    title: "リスク早期発見のための参照知識まとめ（下書き）",
  },
  {
    createdAt: "2026-06-01T09:00:00.000Z",
    createdBy: "管理者（デモ）",
    difficultyId: "beginner",
    id: "material-4",
    learningThemeId: "support-planning",
    materialType: "teaching_case",
    publicationStatus: "archived",
    revisions: [
      {
        changedAt: "2026-06-01T09:00:00.000Z",
        changedBy: "管理者（デモ）",
        fromStatus: null,
        toStatus: "draft",
      },
      {
        changedAt: "2026-06-10T09:00:00.000Z",
        changedBy: "管理者（デモ）",
        fromStatus: "draft",
        toStatus: "published",
      },
      {
        changedAt: "2026-07-01T09:00:00.000Z",
        changedBy: "管理者（デモ）",
        fromStatus: "published",
        toStatus: "archived",
      },
    ],
    specialtyId: "public-health",
    title: "旧版の支援方針演習（アーカイブ済み）",
  },
];

let rubrics: Rubric[] = [
  {
    createdAt: "2026-07-18T09:00:00.000Z",
    createdBy: "鈴木 reviewer",
    id: "rubric-1",
    items: [
      {
        criterionName: "根拠の明確さ",
        description: "S/O が A を支えているか。",
        id: "rubric-1-item-1",
      },
      {
        criterionName: "追加確認事項の具体性",
        description: "次回確認すべき事項が具体的か。",
        id: "rubric-1-item-2",
      },
      {
        criterionName: "支援方針の妥当性",
        description: "A から P への論理が妥当か。",
        id: "rubric-1-item-3",
      },
    ],
    name: "支援方針アセスメントルーブリック",
    reviewStatus: "expert_review_required",
    targetType: "exercise_feedback",
    versionNo: 1,
  },
  {
    createdAt: "2026-06-20T09:00:00.000Z",
    createdBy: "高橋 nurse",
    id: "rubric-2",
    items: [
      {
        criterionName: "S/O の区別",
        description: "主観的情報と客観的情報を混在させていないか。",
        id: "rubric-2-item-1",
      },
      {
        criterionName: "曖昧表現の排除",
        description: "「多め」「少し」等の曖昧表現が無いか。",
        id: "rubric-2-item-2",
      },
    ],
    name: "記録表現ルーブリック",
    reviewStatus: "confirmed",
    targetType: "material_review",
    versionNo: 2,
  },
];

const referenceKnowledge: ReferenceKnowledge[] = [
  {
    externalKbRef: "law-kb:child-abuse-prevention",
    id: "rk-1",
    linkedMaterialIds: ["material-1"],
    linkedRubricIds: ["rubric-1"],
    sourceType: "law",
    summary: "児童虐待を発見した場合の通告義務を定める条文。",
    title: "児童虐待防止法 通告義務",
  },
  {
    externalKbRef: "medical-care-law-kb:basic-law-textbook",
    id: "rk-2",
    linkedMaterialIds: [],
    linkedRubricIds: ["rubric-2"],
    sourceType: "medical_care_law",
    summary: "保険診療における記録の要件を定める章。",
    title: "保険診療基本法令 記録要件",
  },
  {
    id: "rk-3",
    linkedMaterialIds: ["material-1"],
    linkedRubricIds: [],
    sourceType: "internal_note",
    summary: "記録表現の改善についての内部指導メモ。",
    title: "内部指導メモ: 記録表現のコツ",
  },
];

let soapMappingVersions: SoapMappingVersion[] = [
  {
    createdBy: "管理者（デモ）",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    id: "mapping-support-activity-1",
    isCurrent: false,
    mappingDefinition: {
      A: "支援者のアセスメントを記載。",
      O: "訪問時の客観的観察事項を記載。",
      P: "次回訪問までの支援計画を記載。",
      S: "本人・家族の発言を記載。",
    },
    recordType: "support_activity",
    versionNo: 1,
  },
  {
    createdBy: "管理者（デモ）",
    effectiveFrom: "2026-07-15T00:00:00.000Z",
    id: "mapping-support-activity-2",
    isCurrent: true,
    mappingDefinition: {
      A: "支援者のアセスメントを記載。パートナー等の育児参加状況の確認有無を含める。",
      O: "訪問時の客観的観察事項を記載。",
      P: "次回訪問までの支援計画を記載。次回確認事項を明記する。",
      S: "本人・家族の発言を記載。",
    },
    recordType: "support_activity",
    versionNo: 2,
  },
  {
    createdBy: "管理者（デモ）",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    id: "mapping-general-record-1",
    isCurrent: true,
    mappingDefinition: {
      A: "アセスメント。",
      O: "客観的情報。",
      P: "支援計画。",
      S: "主観的情報。",
    },
    recordType: "general_record",
    versionNo: 1,
  },
  {
    createdBy: "管理者（デモ）",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    id: "mapping-meeting-1",
    isCurrent: true,
    mappingDefinition: {
      A: "会議での見解・論点整理。",
      O: "会議で共有された事実情報。",
      P: "決定した方針・次回までの対応。",
      S: "参加者の発言・懸念。",
    },
    recordType: "meeting",
    versionNo: 1,
  },
  {
    createdBy: "管理者（デモ）",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    id: "mapping-summary-1",
    isCurrent: true,
    mappingDefinition: {
      A: "期間全体のアセスメントの要約。",
      O: "期間全体の客観的情報の要約。",
      P: "今後の支援方針の要約。",
      S: "期間全体の主観的情報の要約。",
    },
    recordType: "summary",
    versionNo: 1,
  },
];

let requiredItems: RequiredRecommendedItem[] = [
  {
    aggregationCategory: "基本情報",
    id: "req-item-1",
    itemName: "訪問日時",
    recordType: "support_activity",
    requirementLevel: "required",
  },
  {
    aggregationCategory: "リスク評価",
    id: "req-item-2",
    itemName: "リスク兆候の有無",
    recordType: "support_activity",
    requirementLevel: "required",
  },
  {
    aggregationCategory: "リスク評価",
    id: "req-item-3",
    itemName: "パートナー等の育児参加状況",
    recordType: "support_activity",
    requirementLevel: "recommended",
    specialtyId: "maternal-child",
  },
  {
    aggregationCategory: "支援計画",
    id: "req-item-4",
    itemName: "次回確認事項",
    recordType: "support_activity",
    requirementLevel: "required",
  },
  {
    aggregationCategory: "基本情報",
    id: "req-item-5",
    itemName: "出席者",
    recordType: "meeting",
    requirementLevel: "required",
  },
];

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export async function listMaterials(
  filters: MaterialFilters = {},
): Promise<Material[]> {
  return delay(filterMaterials(materials, filters));
}

export async function changeMaterialStatus(
  id: string,
  nextStatus: PublicationStatus,
  changedBy: string,
): Promise<Material[]> {
  materials = changeMaterialPublicationStatus(
    materials,
    id,
    nextStatus,
    changedBy,
  );
  return delay(materials);
}

export async function addMaterial(
  input: NewMaterialInput,
): Promise<Material[]> {
  materials = createMaterial(materials, input);
  return delay(materials);
}

export async function listRubrics(): Promise<Rubric[]> {
  return delay(rubrics);
}

export async function setRubricStatus(
  id: string,
  nextStatus: RubricReviewStatus,
): Promise<Rubric[]> {
  rubrics = setRubricReviewStatus(rubrics, id, nextStatus);
  return delay(rubrics);
}

export async function addRubric(input: NewRubricInput): Promise<Rubric[]> {
  rubrics = createRubric(rubrics, input);
  return delay(rubrics);
}

export async function listReferenceKnowledge(): Promise<ReferenceKnowledge[]> {
  return delay(referenceKnowledge);
}

export async function listSoapMappingVersions(
  recordType: SoapRecordType,
): Promise<SoapMappingVersion[]> {
  return delay(versionsForRecordType(soapMappingVersions, recordType));
}

export async function addSoapMappingVersion(
  recordType: SoapRecordType,
  mappingDefinition: MappingDefinition,
  createdBy: string,
): Promise<SoapMappingVersion[]> {
  soapMappingVersions = createSoapMappingVersion(
    soapMappingVersions,
    recordType,
    mappingDefinition,
    createdBy,
  );
  return delay(versionsForRecordType(soapMappingVersions, recordType));
}

export async function listRequiredItems(
  filters: RequiredItemFilters = {},
): Promise<RequiredRecommendedItem[]> {
  return delay(filterRequiredItems(requiredItems, filters));
}

export async function addRequiredItem(
  input: NewRequiredItemInput,
): Promise<RequiredRecommendedItem[]> {
  requiredItems = createRequiredItem(requiredItems, input);
  return delay(requiredItems);
}
