import { describe, expect, test } from "bun:test";

import {
  applyAgentEvent,
  parseAgentEvent,
  requestWebSocketUrl,
} from "./index.ts";

const CONVERSATION_ID = "chat-00000000-0000-4000-8000-000000000000";

describe("requestWebSocketUrl", () => {
  test("POST /api/ws-url に Bearer access token を送る", async () => {
    let captured: { body?: unknown; headers?: Headers; url?: string } = {};
    const response = await requestWebSocketUrl({
      accessToken: "jwt-token",
      conversationId: CONVERSATION_ID,
      fetchFn: async (url, init) => {
        captured = {
          body: JSON.parse(String(init?.body)),
          headers: new Headers(init?.headers),
          url: String(url),
        };
        return Response.json({
          conversationId: CONVERSATION_ID,
          expiresIn: 300,
          webSocketUrl: "wss://example.test/ws",
        });
      },
    });

    expect(response).toEqual({
      conversationId: CONVERSATION_ID,
      expiresIn: 300,
      webSocketUrl: "wss://example.test/ws",
    });
    expect(captured).toEqual({
      body: { conversationId: CONVERSATION_ID },
      headers: expect.any(Headers),
      url: "/api/ws-url",
    });
    expect(captured.headers?.get("authorization")).toBe("Bearer jwt-token");
    expect(captured.headers?.get("content-type")).toBe("application/json");
  });

  test("access token がなければ readable error を throw する", async () => {
    await expect(
      requestWebSocketUrl({
        accessToken: " ",
        conversationId: CONVERSATION_ID,
        fetchFn: async () => {
          throw new Error("must not be called");
        },
      }),
    ).rejects.toThrow("access token is required");
  });

  test("non-2xx response は readable error を throw する", async () => {
    await expect(
      requestWebSocketUrl({
        accessToken: "bad-token",
        conversationId: CONVERSATION_ID,
        fetchFn: async () =>
          Response.json({ error: "forbidden" }, { status: 403 }),
      }),
    ).rejects.toThrow("forbidden");
  });
});

describe("parseAgentEvent / applyAgentEvent", () => {
  test("ready は回答準備中の progress を設定する", () => {
    const event = parseAgentEvent(
      JSON.stringify({
        type: "ready",
        conversationId: CONVERSATION_ID,
      }),
    );

    expect(applyAgentEvent({ done: false, text: "" }, event)).toEqual({
      done: false,
      progress: {
        label: "回答を準備しています",
        tone: "active",
      },
      text: "",
    });
  });

  test("tool_start / tool_end は専門 tool 名を progress label に変換する", () => {
    const started = applyAgentEvent(
      { done: false, text: "" },
      parseAgentEvent(
        JSON.stringify({ type: "tool_start", name: "database_rag_agent" }),
      ),
    );

    expect(started.progress).toEqual({
      label: "データベース確認中",
      tone: "active",
    });

    const completed = applyAgentEvent(
      started,
      parseAgentEvent(
        JSON.stringify({
          type: "tool_end",
          name: "database_rag_agent",
          ok: true,
        }),
      ),
    );

    expect(completed.progress).toEqual({
      label: "データベース確認完了",
      tone: "complete",
    });
  });

  test("未知の tool 名は内部名を出さず fallback progress にする", () => {
    const event = parseAgentEvent(
      JSON.stringify({ type: "tool_start", name: "internal_debug_tool" }),
    );

    expect(applyAgentEvent({ done: false, text: "" }, event).progress).toEqual({
      label: "情報を確認中",
      tone: "active",
    });
  });

  test("delta を active assistant text に追加する", () => {
    const event = parseAgentEvent(
      JSON.stringify({ type: "delta", text: "hi" }),
    );
    expect(applyAgentEvent({ done: false, text: "" }, event)).toEqual({
      done: false,
      progress: {
        label: "回答を生成中",
        tone: "active",
      },
      text: "hi",
    });
  });

  test("final は text を確定し、重複させない", () => {
    const event = parseAgentEvent(
      JSON.stringify({
        type: "final",
        response: "hello",
        conversationId: CONVERSATION_ID,
        modelId: "test-model",
      }),
    );
    expect(applyAgentEvent({ done: false, text: "hel" }, event)).toEqual({
      done: true,
      progress: undefined,
      text: "hello",
    });
  });

  test("error は stale progress を消して error を記録する", () => {
    const event = parseAgentEvent(
      JSON.stringify({ type: "error", message: "failed" }),
    );

    expect(
      applyAgentEvent(
        {
          done: false,
          progress: { label: "データベース確認中", tone: "active" },
          text: "",
        },
        event,
      ),
    ).toEqual({
      done: true,
      error: "failed",
      progress: undefined,
      text: "",
    });
  });
});
