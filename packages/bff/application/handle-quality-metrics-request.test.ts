import { describe, expect, test } from "bun:test";

import {
  type HandleQualityMetricsOptions,
  handleQualityMetricsRequest,
} from "./handle-quality-metrics-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

function baseOptions(
  overrides: Partial<HandleQualityMetricsOptions> = {},
): HandleQualityMetricsOptions {
  return {
    authContext: AUTH_CONTEXT,
    listMetrics: async () => [],
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleQualityMetricsRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleQualityMetricsRequest(
      { method: "OPTIONS", path: "/api/quality-metrics" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleQualityMetricsRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleQualityMetricsRequest(
      { method: "GET", path: "/api/quality-metrics" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleQualityMetricsRequest(
      { method: "GET", path: "/api/quality-metrics" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  test("metrics 一覧を返す", async () => {
    const response = await handleQualityMetricsRequest(
      { method: "GET", path: "/api/quality-metrics" },
      baseOptions({
        listMetrics: async () => [
          {
            calculationDescription: "desc",
            displayName: "分類精度",
            metricKey: "classification_accuracy",
            targetEntity: "soap_record_versions",
          },
        ],
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).metrics).toHaveLength(1);
  });
});
