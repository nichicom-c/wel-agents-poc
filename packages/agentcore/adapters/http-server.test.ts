import { describe, expect, test } from "bun:test";
import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import {
  handleRequest,
  handleWebSocketMessage,
  type Responder,
  resolveWebSocketContext,
  resolveWebSocketSessionId,
} from "./http-server.ts";

/** JSON body を binary（AgentCore の送信形式）にして POST Request を作る。 */
function invocationRequest(body: unknown): Request {
  return new Request("http://localhost:8080/invocations", {
    method: "POST",
    body: new TextEncoder().encode(JSON.stringify(body)),
  });
}

describe("handleRequest GET /ping", () => {
  test("healthy JSON を返す", async () => {
    const res = await handleRequest(new Request("http://localhost:8080/ping"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      status: string;
      time_of_last_update: number;
    };
    expect(json.status).toBe("Healthy");
    expect(typeof json.time_of_last_update).toBe("number");
  });
});

describe("handleRequest POST /invocations", () => {
  test("binary JSON body を decode して respond に渡し、結果を JSON 化する", async () => {
    let captured: RuntimeRequest | undefined;
    const respond: Responder = async (payload) => {
      captured = payload;
      return {
        status: "success",
        response: "ok",
        session_id: "s1",
        actor_id: "a1",
        model_id: "m",
      };
    };
    const res = await handleRequest(
      invocationRequest({ prompt: "hi", session_id: "s1", actor_id: "a1" }),
      respond,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "success",
      response: "ok",
    });
    expect(captured).toEqual({
      prompt: "hi",
      session_id: "s1",
      actor_id: "a1",
    });
  });

  test("error 応答もそのまま JSON で返す（service を落とさない）", async () => {
    const respond: Responder = async (): Promise<RuntimeResponse> => ({
      status: "error",
      error: "Missing required configuration: BEDROCK_MODEL_ID",
    });
    const res = await handleRequest(
      invocationRequest({ prompt: "x" }),
      respond,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "error" });
  });

  test("壊れた body は 400 の error JSON", async () => {
    const req = new Request("http://localhost:8080/invocations", {
      method: "POST",
      body: new TextEncoder().encode("{ not json"),
    });
    const res = await handleRequest(req, async () => {
      throw new Error("should not be called");
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ status: "error" });
  });

  test("respond の例外は 500 の error JSON に封じ込める", async () => {
    const res = await handleRequest(
      invocationRequest({ prompt: "x" }),
      async () => {
        throw new Error("bedrock down");
      },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ status: "error" });
  });
});

describe("handleRequest 未知ルート", () => {
  test("404 を返す", async () => {
    const res = await handleRequest(new Request("http://localhost:8080/other"));
    expect(res.status).toBe(404);
  });
});

describe("resolveWebSocketSessionId", () => {
  test("AgentCore session query を読む", () => {
    const req = new Request(
      "http://localhost:8080/ws?X-Amzn-Bedrock-AgentCore-Runtime-Session-Id=chat-00000000-0000-4000-8000-000000000000",
    );
    expect(resolveWebSocketSessionId(req)).toBe(
      "chat-00000000-0000-4000-8000-000000000000",
    );
  });

  test("AgentCore session header を読む", () => {
    const req = new Request("http://localhost:8080/ws", {
      headers: {
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id":
          "chat-00000000-0000-4000-8000-000000000001",
      },
    });
    expect(resolveWebSocketSessionId(req)).toBe(
      "chat-00000000-0000-4000-8000-000000000001",
    );
  });

  test("非 upgrade の /ws は通常 HTTP として 404 を返す", async () => {
    const res = await handleRequest(new Request("http://localhost:8080/ws"));
    expect(res.status).toBe(404);
  });
});

describe("resolveWebSocketContext", () => {
  test("AgentCore session と custom user context の query を読む", () => {
    const req = new Request(
      "http://localhost:8080/ws?X-Amzn-Bedrock-AgentCore-Runtime-Session-Id=chat-00000000-0000-4000-8000-000000000000&X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId=u-user-123&X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId=user-123",
    );
    expect(resolveWebSocketContext(req)).toEqual({
      actorId: "u-user-123",
      sessionId: "chat-00000000-0000-4000-8000-000000000000",
      userId: "user-123",
    });
  });

  test("AgentCore custom user context の header を読む", () => {
    const req = new Request("http://localhost:8080/ws", {
      headers: {
        "X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId": "u-user-123",
        "X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId": "user-123",
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id":
          "chat-00000000-0000-4000-8000-000000000001",
      },
    });
    expect(resolveWebSocketContext(req)).toEqual({
      actorId: "u-user-123",
      sessionId: "chat-00000000-0000-4000-8000-000000000001",
      userId: "user-123",
    });
  });
});

describe("handleWebSocketMessage", () => {
  test("WebSocket context の actor_id を streamResponse に渡す", async () => {
    const sent: string[] = [];
    let captured: RuntimeRequest | undefined;
    let pingCount = 0;
    const closes: Array<{ code?: number; reason?: string }> = [];
    const ws = {
      close: (code?: number, reason?: string) => {
        closes.push({ code, reason });
      },
      data: {
        actorId: "u-user-123",
        sessionId: "chat-00000000-0000-4000-8000-000000000000",
        userId: "user-123",
      },
      ping: () => {
        pingCount += 1;
      },
      send: (message: string) => {
        sent.push(message);
      },
    } as unknown as Bun.ServerWebSocket<{
      actorId?: string;
      sessionId?: string;
      userId?: string;
    }>;

    await handleWebSocketMessage(
      ws,
      JSON.stringify({
        conversationId: "chat-00000000-0000-4000-8000-000000000999",
        message: "hello",
        type: "user_message",
      }),
      async (payload, send) => {
        captured = payload;
        await send({
          type: "ready",
          conversationId: String(payload.session_id),
        });
      },
    );

    expect(captured).toEqual({
      actor_id: "u-user-123",
      prompt: "hello",
      session_id: "chat-00000000-0000-4000-8000-000000000000",
      user_id: "user-123",
    });
    expect(sent.map((message) => JSON.parse(message))).toEqual([
      {
        type: "ready",
        conversationId: "chat-00000000-0000-4000-8000-000000000000",
      },
    ]);
    // 速い応答では keepalive ping は発火せず、完了後にサーバ側から正常クローズする。
    expect(pingCount).toBe(0);
    expect(closes).toEqual([{ code: 1000, reason: "complete" }]);
  });
});
