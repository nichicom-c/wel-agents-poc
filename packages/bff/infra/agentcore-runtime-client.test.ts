import { describe, expect, test } from "bun:test";
import type { InvokeAgentRuntimeCommandOutput } from "@aws-sdk/client-bedrock-agentcore";
import type { RuntimePayload } from "../contracts/runtime.ts";
import { invokeAgentCoreRuntime } from "./agentcore-runtime-client.ts";
import type { LambdaConfig } from "./lambda-config.ts";

const CONFIG: LambdaConfig = {
  actorClaim: "sub",
  actorId: "web-user",
  authMode: "jwt",
  qualifier: "sample",
  region: "ap-northeast-1",
  requestTimeoutMs: 28000,
  runtimeArn:
    "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
  userIdClaim: "sub",
};

const RUNTIME_SESSION_ID = "chat-00000000-0000-4000-8000-000000000000";
const PAYLOAD: RuntimePayload = {
  actor_id: "web-user",
  prompt: "hello",
  session_id: RUNTIME_SESSION_ID,
};

describe("invokeAgentCoreRuntime", () => {
  test("AgentCore Runtime SDK command を作り、success stream を正規化する", async () => {
    let commandInput: Record<string, unknown> | undefined;
    let abortSignal: AbortSignal | undefined;

    const result = await invokeAgentCoreRuntime(
      CONFIG,
      RUNTIME_SESSION_ID,
      PAYLOAD,
      {
        sender: async (command, options) => {
          commandInput = command.input as Record<string, unknown>;
          abortSignal = options?.abortSignal;

          return {
            $metadata: { httpStatusCode: 200 },
            contentType: "application/json",
            response: {
              transformToString: async () =>
                JSON.stringify({
                  response: "answer",
                  status: "success",
                }),
            },
            statusCode: 200,
          } as unknown as InvokeAgentRuntimeCommandOutput;
        },
      },
    );

    expect(result).toEqual({
      ok: true,
      payload: {
        response: "answer",
        status: "success",
      },
      statusCode: 200,
    });
    expect(commandInput).toMatchObject({
      accept: "application/json",
      agentRuntimeArn:
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
      contentType: "application/json",
      qualifier: "sample",
      runtimeSessionId: RUNTIME_SESSION_ID,
    });
    expect(
      JSON.parse(new TextDecoder().decode(commandInput?.payload as Uint8Array)),
    ).toEqual(PAYLOAD);
    expect(abortSignal).toBeDefined();
    expect(abortSignal?.aborted).toBe(false);
  });

  test("SDK service error を RuntimeInvokeResult に正規化する", async () => {
    const serviceError = Object.assign(new Error("runtime failed"), {
      $metadata: { httpStatusCode: 429 },
      name: "ThrottlingException",
    });

    const result = await invokeAgentCoreRuntime(
      CONFIG,
      RUNTIME_SESSION_ID,
      PAYLOAD,
      {
        sender: async () => {
          throw serviceError;
        },
      },
    );

    expect(result).toEqual({
      body: "runtime failed",
      ok: false,
      statusCode: 429,
    });
  });

  test("timeout abort は AbortError として伝播する", async () => {
    let clearedTimeout: unknown;

    await expect(
      invokeAgentCoreRuntime(CONFIG, RUNTIME_SESSION_ID, PAYLOAD, {
        clearTimeout: (timeoutId) => {
          clearedTimeout = timeoutId;
        },
        sender: async (_command, options) => {
          expect(options?.abortSignal?.aborted).toBe(true);
          throw new DOMException("aborted", "AbortError");
        },
        setTimeout: (callback) => {
          callback();
          return "timer-id";
        },
      }),
    ).rejects.toThrow("aborted");
    expect(clearedTimeout).toBe("timer-id");
  });
});
