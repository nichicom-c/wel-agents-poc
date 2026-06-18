import { describe, expect, test } from "bun:test";

import { handleDevInfoRequest } from "./handle-dev-info-request.ts";

const DEV_INFO = {
  auth: { clientId: "client-1", jwtIssuer: "https://issuer.example" },
  aws: { accountId: "123456789012", region: "ap-northeast-1" },
  bff: {
    apiEndpoint: "https://api.example",
    authMode: "jwt",
    health: { checkedAt: "2026-06-15T00:00:00.000Z", status: "ok" },
    lambdaFunctionName: "wel-agents-bff",
    lambdaLogGroupName: "/aws/lambda/wel-agents-bff",
  },
  generatedAt: "2026-06-15T00:00:00.000Z",
  knowledgeBases: {
    database: "KB002",
    document: "KB003",
    law: "KB004",
    medical_care_law: "KB005",
    support_activity: "KB006",
  },
  memory: { id: "memory-1" },
  runtime: {
    arn: "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
    endpointName: "sample",
    health: {
      reason: "production runtime health is not checked by this endpoint",
      status: "not_checked",
    },
    qualifier: "sample",
  },
} as const;

describe("handleDevInfoRequest", () => {
  test("GET /api/dev-info requires authentication", async () => {
    const response = await handleDevInfoRequest(
      { method: "GET", path: "/api/dev-info" },
      { getDevInfo: async () => DEV_INFO },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "authentication required",
    });
  });

  test("GET /api/dev-info returns allowlisted dev info for authenticated users", async () => {
    const response = await handleDevInfoRequest(
      { method: "GET", path: "/api/dev-info" },
      {
        authContext: { actorId: "u-user-1", userId: "user-1" },
        getDevInfo: async () => DEV_INFO,
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(DEV_INFO);
    expect(response.body).not.toContain("webSocketUrl");
    expect(response.body).not.toContain("X-Amz-");
    expect(response.body).not.toContain("accessToken");
  });

  test("unsupported route returns 404", async () => {
    const response = await handleDevInfoRequest(
      { method: "POST", path: "/api/dev-info" },
      {
        authContext: { actorId: "u-user-1", userId: "user-1" },
        getDevInfo: async () => DEV_INFO,
      },
    );

    expect(response.statusCode).toBe(404);
  });
});
