/**
 * 評価ルーブリック（保健師SOAP_KB_詳細設計書_v2 の rubric / rubric_level）の contract。
 * DB スキーマは `terraform/aws/bff/migrations/0004_create_knowledge_base.sql` に対応する。
 * 旧 issue #10 ベースの `rubrics` / `rubric_items`（review_status による承認フロー）を置き換える。
 */

export const RUBRIC_LEVEL_NUMBERS = [1, 2, 3, 4] as const;

export type RubricLevelNumber = (typeof RUBRIC_LEVEL_NUMBERS)[number];

export function isRubricLevelNumber(
  value: unknown,
): value is RubricLevelNumber {
  return (
    typeof value === "number" &&
    (RUBRIC_LEVEL_NUMBERS as readonly number[]).includes(value)
  );
}

export type RubricLevel = {
  level: RubricLevelNumber;
  levelName: string;
  definition: string;
  criteria: string[];
};

export type Rubric = {
  id: string;
  knowledgeBaseId: string;
  code: string;
  name: string;
  objective: string;
  sortOrder: number;
  isActive: boolean;
  levels: RubricLevel[];
  createdAt: string;
};

export type CreateRubricLevelInput = {
  level: RubricLevelNumber;
  levelName: string;
  definition: string;
  criteria?: string[];
};

export type CreateRubricInput = {
  knowledgeBaseId: string;
  code: string;
  name: string;
  objective: string;
  sortOrder?: number;
  levels: CreateRubricLevelInput[];
};
