/**
 * 品質指標の定義。issue #10 の Acceptance Criteria「分類精度、不足検出率、採用率、修正率、
 * 差し戻し率、学習効果の項目が定義されていること」に対応する。BFF `/api/quality-metrics`
 * （`quality_metrics_definitions`）から取得する（値の目標ライン・合格基準は issue #10 の
 * Out of Scope のため、ここは定義そのものだけを持つ）。
 */
export type QualityMetricDefinition = {
  metricKey: string;
  displayName: string;
  calculationDescription: string;
  targetEntity: string;
};
