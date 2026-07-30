/**
 * issue #10 の Acceptance Criteria「分類精度、不足検出率、採用率、修正率、差し戻し率、
 * 学習効果の項目が定義されていること」に対応する固定の指標定義。実際の集計値は
 * `soap_record_versions` / `material_candidate_status_events` / `exercise_attempts` を
 * 集計する view から取得する想定（`docs/notes/2026-07-30-...` を参照）で、この一覧は
 * 定義そのものだけを持つ（値の目標ライン・合格基準は issue #10 の Out of Scope）。
 */
export type QualityMetricKey =
  | "classification_accuracy"
  | "gap_detection_rate"
  | "adoption_rate"
  | "correction_rate"
  | "bounce_back_rate"
  | "learning_effectiveness";

export type QualityMetricDefinition = {
  metricKey: QualityMetricKey;
  displayName: string;
  calculationDescription: string;
  targetEntity: string;
};

export const QUALITY_METRIC_DEFINITIONS: readonly QualityMetricDefinition[] = [
  {
    calculationDescription:
      "SOAP 下書き生成 AI の分類（S/O/A/P）が、専門職の採用/編集後の結果と一致した割合。",
    displayName: "分類精度",
    metricKey: "classification_accuracy",
    targetEntity: "soap_record_versions",
  },
  {
    calculationDescription:
      "不足確認（issue #6）が検出した不足のうち、実際に記録の改善につながった割合。",
    displayName: "不足検出率",
    metricKey: "gap_detection_rate",
    targetEntity: "soap_record_versions",
  },
  {
    calculationDescription: "教材候補（issue #8）のうち承認済みになった割合。",
    displayName: "採用率",
    metricKey: "adoption_rate",
    targetEntity: "material_candidate_status_events",
  },
  {
    calculationDescription: "教材候補のうち要修正を経て承認に至った割合。",
    displayName: "修正率",
    metricKey: "correction_rate",
    targetEntity: "material_candidate_status_events",
  },
  {
    calculationDescription: "教材候補のうち却下された割合。",
    displayName: "差し戻し率",
    metricKey: "bounce_back_rate",
    targetEntity: "material_candidate_status_events",
  },
  {
    calculationDescription:
      "新人保健師向け演習（issue #9）で、同一受講者の回答が改善傾向にある割合。",
    displayName: "学習効果",
    metricKey: "learning_effectiveness",
    targetEntity: "exercise_attempts",
  },
];
