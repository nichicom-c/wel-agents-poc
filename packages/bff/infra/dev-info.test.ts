import { describe, expect, test } from "bun:test";

import { buildDevInfo, parseAccountIdFromArn } from "./dev-info.ts";

const RUNTIME_ARN =
  "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc";
const NOW = new Date("2026-06-15T00:00:00.000Z");

const BASE_CONFIG = {
  authClientId: "client-1",
  authMode: "jwt",
  databaseKbId: "KB002",
  documentKbId: "KB003",
  lawKbId: "KB004",
  medicalCareLawKbId: "KB005",
  supportActivityKbId: "KB006",
  jwtIssuer: "https://issuer.example",
  lambdaFunctionName: "wel-agents-bff",
  lambdaLogGroupName: "/aws/lambda/wel-agents-bff",
  memoryId: "memory-1",
  region: "ap-northeast-1",
  runtimeArn: RUNTIME_ARN,
  runtimeEndpointName: "sample",
  runtimeQualifier: "sample",
} as const;

describe("buildDevInfo", () => {
  test("STS caller identity account ID wins over ARN fallback", async () => {
    const info = await buildDevInfo(BASE_CONFIG, {
      getCallerIdentity: async () => ({ accountId: "210987654321" }),
      headers: {
        host: "api.example.com",
        "x-forwarded-proto": "https",
      },
      now: () => NOW,
    });

    expect(info.aws).toEqual({
      accountId: "210987654321",
      region: "ap-northeast-1",
    });
    expect(info.bff.apiEndpoint).toBe("https://api.example.com");
    expect(info.bff.health).toEqual({
      checkedAt: "2026-06-15T00:00:00.000Z",
      status: "ok",
    });
  });

  test("STS failure falls back to account ID parsed from Runtime ARN", async () => {
    const info = await buildDevInfo(BASE_CONFIG, {
      getCallerIdentity: async () => {
        throw new Error("sts unavailable");
      },
      now: () => NOW,
    });

    expect(info.aws.accountId).toBe("123456789012");
  });

  test("missing optional values become not_configured or unknown", async () => {
    const info = await buildDevInfo(
      {
        authMode: "dev",
        runtimeArn: "",
        runtimeQualifier: "",
      },
      { now: () => NOW },
    );

    expect(info).toMatchObject({
      auth: { clientId: "not_configured", jwtIssuer: "not_configured" },
      aws: { accountId: "unknown", region: "unknown" },
      bff: {
        apiEndpoint: "unknown",
        authMode: "dev",
        lambdaFunctionName: "not_configured",
        lambdaLogGroupName: "not_configured",
      },
      knowledgeBases: {
        database: "not_configured",
        document: "not_configured",
        law: "not_configured",
        medical_care_law: "not_configured",
        support_activity: "not_configured",
      },
      memory: { id: "not_configured" },
      runtime: {
        arn: "not_configured",
        endpointName: "not_configured",
        qualifier: "not_configured",
      },
    });
  });

  test("serialized output excludes credentials, tokens, presigned URLs, and raw env dumps", async () => {
    const info = await buildDevInfo(BASE_CONFIG, { now: () => NOW });
    const serialized = JSON.stringify(info);

    expect(serialized).not.toContain("webSocketUrl");
    expect(serialized).not.toContain("X-Amz-");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("credential");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("process.env");
  });

  test("production runtime health is not_checked", async () => {
    const info = await buildDevInfo(BASE_CONFIG, { now: () => NOW });

    expect(info.runtime.health).toEqual({
      reason: "production runtime health is not checked by this endpoint",
      status: "not_checked",
    });
  });

  test("local runtime health can check /ping", async () => {
    let requestedUrl = "";
    const info = await buildDevInfo(
      { ...BASE_CONFIG, localRuntimeUrl: "http://localhost:8080" },
      {
        fetchFn: async (url) => {
          requestedUrl = String(url);
          return Response.json({ status: "healthy" });
        },
        now: () => NOW,
      },
    );

    expect(requestedUrl).toBe("http://localhost:8080/ping");
    expect(info.runtime.health).toEqual({
      checkedAt: "2026-06-15T00:00:00.000Z",
      status: "ok",
    });
  });
});

describe("parseAccountIdFromArn", () => {
  test("extracts a 12-digit account ID", () => {
    expect(parseAccountIdFromArn(RUNTIME_ARN)).toBe("123456789012");
  });

  test("returns undefined for invalid ARN", () => {
    expect(parseAccountIdFromArn("not-an-arn")).toBeUndefined();
  });
});
