import { describe, expect, test } from "bun:test";

import type { AgentStreamEvent } from "../features/chat-stream/index.ts";
import {
  type ChatSessionRecord,
  messagesForSession,
} from "../features/session-history/index.ts";
import {
  applySessionTurnEvent,
  failSessionTurn,
  isSessionBusy,
  type SessionTurnModel,
  startSessionTurn,
} from "./session-turns.ts";

const SESSION_A: ChatSessionRecord = {
  conversationId: "chat-a",
  createdAt: "2026-06-18T00:00:00.000Z",
  messageCount: 0,
  messages: [],
  preview: "会話はまだありません",
  title: "New session",
  updatedAt: "2026-06-18T00:00:00.000Z",
};

const SESSION_B: ChatSessionRecord = {
  ...SESSION_A,
  conversationId: "chat-b",
  createdAt: "2026-06-18T01:00:00.000Z",
  updatedAt: "2026-06-18T01:00:00.000Z",
};

function initialModel(): SessionTurnModel {
  return {
    sessions: [SESSION_A, SESSION_B],
    turns: {},
  };
}

describe("session-scoped turn model", () => {
  test("turn 開始は対象 session だけに pending assistant message を追加する", () => {
    const next = startSessionTurn(initialModel(), {
      assistantMessage: { id: "a1", role: "assistant", text: "" },
      conversationId: "chat-a",
      startedAt: "2026-06-18T02:00:00.000Z",
      userMessage: { id: "u1", role: "user", text: "hello" },
    });

    expect(isSessionBusy(next.turns, "chat-a")).toBe(true);
    expect(isSessionBusy(next.turns, "chat-b")).toBe(false);
    expect(messagesForSession(next.sessions, "chat-a")).toEqual([
      { id: "u1", role: "user", text: "hello" },
      { id: "a1", role: "assistant", text: "" },
    ]);
    expect(messagesForSession(next.sessions, "chat-b")).toEqual([]);
  });

  test("background session の stream event は対象 session だけを更新する", () => {
    const started = startSessionTurn(initialModel(), {
      assistantMessage: { id: "a1", role: "assistant", text: "" },
      conversationId: "chat-a",
      startedAt: "2026-06-18T02:00:00.000Z",
      userMessage: { id: "u1", role: "user", text: "hello" },
    });

    const delta: AgentStreamEvent = { text: "partial", type: "delta" };
    const withDelta = applySessionTurnEvent(started, {
      conversationId: "chat-a",
      event: delta,
    });

    expect(withDelta.turns["chat-a"]?.progress).toEqual({
      label: "回答を生成中",
      tone: "active",
    });
    expect(messagesForSession(withDelta.sessions, "chat-a").at(-1)).toEqual({
      id: "a1",
      role: "assistant",
      text: "partial",
    });
    expect(messagesForSession(withDelta.sessions, "chat-b")).toEqual([]);

    const final: AgentStreamEvent = {
      conversationId: "chat-a",
      modelId: "test-model",
      response: "complete",
      type: "final",
    };
    const completed = applySessionTurnEvent(withDelta, {
      conversationId: "chat-a",
      event: final,
    });

    expect(isSessionBusy(completed.turns, "chat-a")).toBe(false);
    expect(messagesForSession(completed.sessions, "chat-a").at(-1)).toEqual({
      id: "a1",
      role: "assistant",
      text: "complete",
    });
    expect(messagesForSession(completed.sessions, "chat-b")).toEqual([]);
  });

  test("error は対象 assistant message を更新して turn state を消す", () => {
    const started = startSessionTurn(initialModel(), {
      assistantMessage: { id: "a1", role: "assistant", text: "" },
      conversationId: "chat-a",
      startedAt: "2026-06-18T02:00:00.000Z",
      userMessage: { id: "u1", role: "user", text: "hello" },
    });

    const failed = failSessionTurn(started, {
      conversationId: "chat-a",
      message: "WebSocket connection failed",
    });

    expect(isSessionBusy(failed.turns, "chat-a")).toBe(false);
    expect(messagesForSession(failed.sessions, "chat-a").at(-1)).toEqual({
      id: "a1",
      role: "assistant",
      text: "エラー: WebSocket connection failed",
    });
    expect(messagesForSession(failed.sessions, "chat-b")).toEqual([]);
  });
});
