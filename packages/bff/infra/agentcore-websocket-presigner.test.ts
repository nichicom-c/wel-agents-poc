import { describe, expect, test } from "bun:test";

import { createAgentCoreWebSocketUrl } from "./agentcore-websocket-presigner.ts";

const RUNTIME_ARN =
  "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc";
const SESSION_ID = "chat-00000000-0000-4000-8000-000000000000";

describe("createAgentCoreWebSocketUrl", () => {
  test("AgentCore /ws presigned URL を生成する", async () => {
    const url = await createAgentCoreWebSocketUrl(
      {
        actorId: "u-user-123",
        expiresIn: 999,
        qualifier: "sample",
        region: "ap-northeast-1",
        runtimeArn: RUNTIME_ARN,
        sessionId: SESSION_ID,
        userId: "user-123",
      },
      {
        credentials: {
          accessKeyId: "AKIDEXAMPLE",
          secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        },
        signingDate: new Date("2026-06-15T00:00:00.000Z"),
      },
    );

    const parsed = new URL(url);

    expect(parsed.protocol).toBe("wss:");
    expect(parsed.hostname).toBe(
      "bedrock-agentcore.ap-northeast-1.amazonaws.com",
    );
    expect(parsed.pathname).toBe(
      `/runtimes/${encodeURIComponent(RUNTIME_ARN)}/ws`,
    );
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Credential")).toContain(
      "AKIDEXAMPLE/20260615/ap-northeast-1/bedrock-agentcore/aws4_request",
    );
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(parsed.searchParams.get("qualifier")).toBe("sample");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(
      parsed.searchParams.get("X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"),
    ).toBe(SESSION_ID);
    expect(
      parsed.searchParams.get(
        "X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId",
      ),
    ).toBe("u-user-123");
    expect(
      parsed.searchParams.get("X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId"),
    ).toBe("user-123");

    const urlWithOtherActor = await createAgentCoreWebSocketUrl(
      {
        actorId: "u-other-user",
        expiresIn: 999,
        qualifier: "sample",
        region: "ap-northeast-1",
        runtimeArn: RUNTIME_ARN,
        sessionId: SESSION_ID,
        userId: "other-user",
      },
      {
        credentials: {
          accessKeyId: "AKIDEXAMPLE",
          secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        },
        signingDate: new Date("2026-06-15T00:00:00.000Z"),
      },
    );
    expect(
      new URL(urlWithOtherActor).searchParams.get("X-Amz-Signature"),
    ).not.toBe(parsed.searchParams.get("X-Amz-Signature"));
  });
});
