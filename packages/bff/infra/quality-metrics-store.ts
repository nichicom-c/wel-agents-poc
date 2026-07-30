import type { QualityMetricDefinition } from "../contracts/admin.ts";
import {
  execute,
  parseRows,
  resolveClient,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
} from "./training-data-sql.ts";

/**
 * 品質指標の定義（issue #10）の読み取り専用永続化層。実際の集計値は別途 view から取得する
 * 想定で（issue #10 の Out of Scope: 目標値・合格ラインの設定）、ここは定義だけを返す。
 */

type QualityMetricRow = {
  metric_key: string;
  display_name: string;
  calculation_description: string;
  target_entity: string;
};

export async function listQualityMetrics(
  config: TrainingDataStoreConfig,
  deps: TrainingDataStoreDeps = {},
): Promise<QualityMetricDefinition[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<QualityMetricRow>(
    await execute(
      rdsClient,
      config,
      `select metric_key, display_name, calculation_description, target_entity
       from quality_metrics_definitions
       order by metric_key asc`,
    ),
  );
  return rows.map((row) => ({
    calculationDescription: row.calculation_description,
    displayName: row.display_name,
    metricKey: row.metric_key,
    targetEntity: row.target_entity,
  }));
}
