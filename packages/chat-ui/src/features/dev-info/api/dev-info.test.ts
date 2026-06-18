import { describe, expect, test } from "bun:test";

import { requestDevInfo } from "./dev-info.ts";

const DEV_INFO_PAYLOAD = {
  auth: {
    clientId: "client-1",
    jwtIssuer: "https://issuer.example",
  },
  aws: {
    accountId: "123456789012",
    region: "ap-northeast-1",
  },
  bff: {
    apiEndpoint: "https://api.example",
    authMode: "jwt",
    health: {
      checkedAt: "2026-06-15T00:00:00.000Z",
      status: "ok",
    },
    lambdaFunctionName: "wel-agents-bff-handler",
    lambdaLogGroupName: "/aws/lambda/wel-agents-bff-handler",
  },
  generatedAt: "2026-06-15T00:00:00.000Z",
  knowledgeBases: {
    database: "KB002",
    document: "KB003",
    law: "KB004",
    medical_care_law: "KB005",
    support_activity: "KB006",
  },
  memory: {
    id: "memory-1",
  },
  runtime: {
    arn: "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
    endpointName: "sample",
    health: {
      reason: "production runtime health is not checked by this endpoint",
      status: "not_checked",
    },
    qualifier: "sample",
  },
  webSocketUrl: "wss://example.test/ws?X-Amz-Signature=secret",
  accessToken: "secret-token",
};

describe("requestDevInfo", () => {
  test("GET /api/dev-info に Bearer access token を送って Chat UI 情報を付与する", async () => {
    let captured: { headers?: Headers; method?: string; url?: string } = {};
    const response = await requestDevInfo({
      accessToken: " jwt-token ",
      fetchFn: async (url, init) => {
        captured = {
          headers: new Headers(init?.headers),
          method: init?.method,
          url: String(url),
        };
        return Response.json(DEV_INFO_PAYLOAD);
      },
      locationOrigin: "https://chat.example",
    });

    expect(captured).toEqual({
      headers: expect.any(Headers),
      method: "GET",
      url: "/api/dev-info",
    });
    expect(captured.headers?.get("authorization")).toBe("Bearer jwt-token");
    expect(response).toMatchObject({
      auth: {
        clientId: "client-1",
        jwtIssuer: "https://issuer.example",
      },
      aws: {
        accountId: "123456789012",
        region: "ap-northeast-1",
      },
      bff: {
        authMode: "jwt",
        health: {
          checkedAt: "2026-06-15T00:00:00.000Z",
          status: "ok",
        },
      },
      chatUi: {
        apiRouteBase: "https://chat.example/api",
        origin: "https://chat.example",
      },
      knowledgeBases: {
        database: "KB002",
        document: "KB003",
        law: "KB004",
        medical_care_law: "KB005",
        support_activity: "KB006",
      },
      memory: {
        id: "memory-1",
      },
      runtime: {
        health: {
          reason: "production runtime health is not checked by this endpoint",
          status: "not_checked",
        },
      },
    });
    expect(JSON.stringify(response)).not.toContain("webSocketUrl");
    expect(JSON.stringify(response)).not.toContain("accessToken");
    expect(JSON.stringify(response)).not.toContain("X-Amz-");
  });

  test("access token がなければ readable error を throw する", async () => {
    await expect(
      requestDevInfo({
        accessToken: " ",
        fetchFn: async () => {
          throw new Error("must not be called");
        },
        locationOrigin: "https://chat.example",
      }),
    ).rejects.toThrow("access token is required");
  });

  test("non-2xx response は readable error を throw する", async () => {
    await expect(
      requestDevInfo({
        accessToken: "bad-token",
        fetchFn: async () =>
          Response.json({ error: "authentication required" }, { status: 401 }),
        locationOrigin: "https://chat.example",
      }),
    ).rejects.toThrow("authentication required");
  });

  test("missing values は unknown / not_configured に正規化する", async () => {
    const response = await requestDevInfo({
      accessToken: "jwt-token",
      fetchFn: async () =>
        Response.json({
          bff: {
            authMode: "dev",
          },
        }),
      locationOrigin: "",
    });

    expect(response).toMatchObject({
      auth: {
        clientId: "not_configured",
        jwtIssuer: "not_configured",
      },
      aws: {
        accountId: "unknown",
        region: "unknown",
      },
      bff: {
        apiEndpoint: "unknown",
        authMode: "dev",
        health: {
          reason: "not checked",
          status: "not_checked",
        },
        lambdaFunctionName: "not_configured",
        lambdaLogGroupName: "not_configured",
      },
      chatUi: {
        apiRouteBase: "unknown",
        origin: "unknown",
      },
      runtime: {
        arn: "not_configured",
        endpointName: "not_configured",
        qualifier: "not_configured",
      },
    });
  });
});
