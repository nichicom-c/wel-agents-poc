import { describe, expect, test } from "bun:test";

import { streamEventToServerEvent } from "./stream-events.ts";

describe("streamEventToServerEvent", () => {
  test("Strands textDelta を delta event に変換する", () => {
    expect(
      streamEventToServerEvent({
        type: "modelStreamUpdateEvent",
        event: {
          type: "modelContentBlockDeltaEvent",
          delta: { type: "textDelta", text: "hello" },
        },
      }),
    ).toEqual({ type: "delta", text: "hello" });
  });

  test("beforeToolCallEvent を tool_start event に変換する", () => {
    expect(
      streamEventToServerEvent({
        type: "beforeToolCallEvent",
        toolUse: { name: "database_rag_agent" },
      }),
    ).toEqual({ type: "tool_start", name: "database_rag_agent" });
  });

  test("toolResultEvent の success/error を tool_end event に変換する", () => {
    expect(
      streamEventToServerEvent({
        type: "toolResultEvent",
        result: { status: "success" },
        toolUse: { name: "database_rag_agent" },
      }),
    ).toEqual({ type: "tool_end", name: "database_rag_agent", ok: true });

    expect(
      streamEventToServerEvent({
        type: "toolResultEvent",
        result: { status: "error" },
        toolUse: { name: "document_rag_agent" },
      }),
    ).toEqual({ type: "tool_end", name: "document_rag_agent", ok: false });
  });

  test("reasoning delta や未知 event は browser に出さない", () => {
    expect(
      streamEventToServerEvent({
        type: "modelStreamUpdateEvent",
        event: {
          type: "modelContentBlockDeltaEvent",
          delta: { type: "reasoningContentDelta", text: "hidden" },
        },
      }),
    ).toBeUndefined();

    expect(
      streamEventToServerEvent({ type: "agentResultEvent" }),
    ).toBeUndefined();
  });
});
