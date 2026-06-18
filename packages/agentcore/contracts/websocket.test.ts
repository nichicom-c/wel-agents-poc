import { describe, expect, test } from "bun:test";

import {
  encodeServerEvent,
  MAX_WEBSOCKET_MESSAGE_BYTES,
  parseClientMessage,
} from "./websocket.ts";

describe("parseClientMessage", () => {
  test("user_message を trim して parse する", () => {
    expect(
      parseClientMessage(
        JSON.stringify({
          type: "user_message",
          message: " hello ",
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        type: "user_message",
        message: "hello",
        conversationId: "chat-00000000-0000-4000-8000-000000000000",
      },
    });
  });

  test("ping を parse する", () => {
    expect(parseClientMessage(JSON.stringify({ type: "ping" }))).toEqual({
      ok: true,
      value: { type: "ping" },
    });
  });

  test("32KB を超える message を reject する", () => {
    const tooLarge = "x".repeat(MAX_WEBSOCKET_MESSAGE_BYTES + 1);
    const result = parseClientMessage(
      JSON.stringify({
        type: "user_message",
        message: tooLarge,
        conversationId: "chat-00000000-0000-4000-8000-000000000000",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "message exceeds 32KB limit" });
  });

  test("invalid conversationId を reject する", () => {
    const result = parseClientMessage(
      JSON.stringify({
        type: "user_message",
        message: "hello",
        conversationId: "short",
      }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("encodeServerEvent", () => {
  test("server event を JSON 文字列にする", () => {
    expect(
      JSON.parse(encodeServerEvent({ type: "delta", text: "hi" })),
    ).toEqual({ type: "delta", text: "hi" });
  });
});
