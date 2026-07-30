import { describe, expect, test } from "bun:test";

import { listQualityMetrics } from "./quality-metrics-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

class FakeRdsDataClient {
  async send(command: {
    constructor: { name: string };
    input?: Record<string, unknown>;
  }): Promise<unknown> {
    const sql =
      typeof command.input?.sql === "string" ? command.input.sql : undefined;
    if (sql?.includes("from quality_metrics_definitions")) {
      return {
        formattedRecords: JSON.stringify([
          {
            calculation_description:
              "SOAP 下書き生成 AI の分類が一致した割合。",
            display_name: "分類精度",
            metric_key: "classification_accuracy",
            target_entity: "soap_record_versions",
          },
        ]),
      };
    }
    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("listQualityMetrics", () => {
  test("snake_case の行を camelCase の QualityMetricDefinition に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listQualityMetrics(CONFIG, {
      client: client as never,
    });

    expect(result).toEqual([
      {
        calculationDescription: "SOAP 下書き生成 AI の分類が一致した割合。",
        displayName: "分類精度",
        metricKey: "classification_accuracy",
        targetEntity: "soap_record_versions",
      },
    ]);
  });
});
