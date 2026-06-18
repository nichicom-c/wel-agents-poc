import { describe, expect, test } from "bun:test";

import type { Config } from "../infra/config.ts";
import type { MemoryStore } from "../infra/memory.ts";
import { streamResponse } from "./build-stream-response.ts";

function makeConfig(memoryId?: string): Config {
  return {
    modelId: "test-model",
    region: "ap-northeast-1",
    kbIds: {
      database: "kb2",
      document: "kb3",
      law: "kb4",
      medical_care_law: "kb5",
    },
    memoryId,
    numberOfResults: 5,
    supportActivity: {
      kbId: "kb-support-activity",
      kbArn:
        "arn:aws:bedrock:ap-northeast-1:123456789012:knowledge-base/KB12345678",
      includeGeneratedSql: false,
    },
  };
}

const EMPTY_CONFIG: Config = {
  modelId: "",
  region: undefined,
  kbIds: {
    database: "",
    document: "",
    law: "",
    medical_care_law: "",
  },
  memoryId: undefined,
  numberOfResults: 5,
  supportActivity: {
    kbId: "",
    kbArn: "",
    includeGeneratedSql: false,
  },
};

class FakeMemory implements MemoryStore {
  readonly saved: [string, string, string, string][] = [];
  constructor(private readonly history = "") {}
  async recentHistory(): Promise<string> {
    return this.history;
  }
  async saveTurn(
    actorId: string,
    sessionId: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    this.saved.push([actorId, sessionId, userText, assistantText]);
  }
}

describe("streamResponse", () => {
  test("設定不備は error event を返し supervisor を呼ばない", async () => {
    const sent: unknown[] = [];
    let called = false;

    await streamResponse(
      { prompt: "hello" },
      (event) => {
        sent.push(event);
      },
      {
        config: EMPTY_CONFIG,
        supervisorStreamer: async function* () {
          called = true;
          yield { type: "unexpectedEvent" };
        },
      },
    );

    expect(called).toBe(false);
    expect(sent).toEqual([
      {
        type: "error",
        message:
          "Missing required configuration: BEDROCK_MODEL_ID, DATABASE_KB_ID, DOCUMENT_KB_ID, LAW_KB_ID, MEDICAL_CARE_LAW_KB_ID, SUPPORT_ACTIVITY_KB_ID",
      },
    ]);
  });

  test("user message から ready, delta, final を送る", async () => {
    const sent: unknown[] = [];
    const messages: string[] = [];
    const memory = new FakeMemory("User: prev\nAssistant: ok");

    await streamResponse(
      {
        prompt: "hello",
        session_id: "chat-00000000-0000-4000-8000-000000000000",
        actor_id: "web-user",
      },
      (event) => {
        sent.push(event);
      },
      {
        config: makeConfig("mem"),
        memory,
        supervisorStreamer: async function* (message) {
          messages.push(message);
          yield {
            type: "modelStreamUpdateEvent",
            event: {
              type: "modelContentBlockDeltaEvent",
              delta: { type: "textDelta", text: "hello" },
            },
          };
          return {
            lastMessage: {
              role: "assistant",
              content: [{ type: "textBlock", text: "hello" }],
            },
          };
        },
      },
    );

    expect(sent).toEqual([
      {
        type: "ready",
        conversationId: "chat-00000000-0000-4000-8000-000000000000",
      },
      { type: "delta", text: "hello" },
      {
        type: "final",
        response: "hello",
        conversationId: "chat-00000000-0000-4000-8000-000000000000",
        modelId: "test-model",
      },
    ]);
    expect(messages[0]).toContain("Previous conversation:");
    expect(memory.saved).toEqual([
      [
        "web-user",
        "chat-00000000-0000-4000-8000-000000000000",
        "hello",
        "hello",
      ],
    ]);
  });

  test("Memory の失敗は warning にして stream を継続する", async () => {
    const sent: unknown[] = [];
    const warnings: string[] = [];
    const memory: MemoryStore = {
      recentHistory: async () => {
        throw new Error("read failed");
      },
      saveTurn: async () => {
        throw new Error("write failed");
      },
    };

    await streamResponse(
      { prompt: "hello", session_id: "s1", actor_id: "a1" },
      (event) => {
        sent.push(event);
      },
      {
        config: makeConfig("mem"),
        memory,
        supervisorStreamer: async function* () {
          yield { type: "ignoredEvent" };
          return {
            lastMessage: {
              role: "assistant",
              content: [{ type: "textBlock", text: "answer" }],
            },
          };
        },
        warn: (message) => warnings.push(message),
      },
    );

    expect(sent).toContainEqual({
      type: "final",
      response: "answer",
      conversationId: "s1",
      modelId: "test-model",
    });
    expect(warnings.some((w) => w.includes("recentHistory failed"))).toBe(true);
    expect(warnings.some((w) => w.includes("saveTurn failed"))).toBe(true);
  });
});
