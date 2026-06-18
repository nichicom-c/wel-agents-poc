import { describe, expect, test } from "bun:test";
import type {
  CreateEventCommand,
  CreateEventCommandOutput,
  Event,
  ListEventsCommand,
  ListEventsCommandOutput,
} from "@aws-sdk/client-bedrock-agentcore";

import {
  ConversationMemory,
  formatEvents,
  type MemoryClient,
  sortEventsByTimestamp,
} from "./memory.ts";

/** USER/ASSISTANT の 2 メッセージを持つ 1 ターン event を作る。 */
function turnEvent(
  user: string,
  assistant: string,
  isoTimestamp: string,
): Event {
  return {
    memoryId: "mem-1",
    actorId: "a1",
    sessionId: "s1",
    eventId: `e-${isoTimestamp}`,
    eventTimestamp: new Date(isoTimestamp),
    payload: [
      { conversational: { role: "USER", content: { text: user } } },
      { conversational: { role: "ASSISTANT", content: { text: assistant } } },
    ],
  } as Event;
}

/** create/list を模した fake client。送信 command を記録する。 */
class FakeMemoryClient implements MemoryClient {
  readonly created: CreateEventCommand[] = [];
  readonly listed: ListEventsCommand[] = [];
  constructor(private readonly events: Event[] = []) {}

  send(command: CreateEventCommand): Promise<CreateEventCommandOutput>;
  send(command: ListEventsCommand): Promise<ListEventsCommandOutput>;
  async send(
    command: CreateEventCommand | ListEventsCommand,
  ): Promise<CreateEventCommandOutput | ListEventsCommandOutput> {
    if (command.constructor.name === "CreateEventCommand") {
      this.created.push(command as CreateEventCommand);
      return { event: undefined, $metadata: {} };
    }
    this.listed.push(command as ListEventsCommand);
    return { events: this.events, $metadata: {} };
  }
}

describe("sortEventsByTimestamp", () => {
  test("順序未規定の入力を eventTimestamp 昇順に並べ替える", () => {
    const a = turnEvent("q1", "a1", "2026-06-14T00:00:01Z");
    const b = turnEvent("q2", "a2", "2026-06-14T00:00:02Z");
    const c = turnEvent("q3", "a3", "2026-06-14T00:00:03Z");
    const sorted = sortEventsByTimestamp([b, c, a]);
    expect(sorted.map((e) => e.eventId)).toEqual([
      a.eventId,
      b.eventId,
      c.eventId,
    ]);
  });
});

describe("formatEvents", () => {
  test("role を順に「Label: text」へ整形する", () => {
    const events = [
      turnEvent("hi", "hello", "2026-06-14T00:00:01Z"),
      turnEvent("and then?", "sure", "2026-06-14T00:00:02Z"),
    ];
    expect(formatEvents(events)).toBe(
      "User: hi\nAssistant: hello\nUser: and then?\nAssistant: sure",
    );
  });

  test("空入力は空文字列", () => {
    expect(formatEvents([])).toBe("");
  });

  test("壊れた payload は読み飛ばす", () => {
    const junk = [
      { payload: undefined } as Event,
      { payload: [{ conversational: { role: "USER", content: {} } }] } as Event,
      {
        payload: [
          { conversational: { role: "USER", content: { text: "  " } } },
        ],
      } as Event,
      { payload: [{ blob: "x" }] } as Event,
    ];
    expect(formatEvents(junk)).toBe("");
  });

  test("max_chars で末尾優先に丸める", () => {
    const big = [
      turnEvent("x".repeat(100), "y".repeat(100), "2026-06-14T00:00:01Z"),
    ];
    expect(formatEvents(big, 20)).toHaveLength(20);
  });
});

describe("ConversationMemory.saveTurn", () => {
  test("CreateEvent を正しい payload・固定 timestamp で送る", async () => {
    const client = new FakeMemoryClient();
    const fixed = new Date("2026-06-14T12:00:00Z");
    const memory = new ConversationMemory("mem-1", {
      client,
      now: () => fixed,
    });
    await memory.saveTurn("a1", "s1", "question", "answer");
    expect(client.created).toHaveLength(1);
    const input = client.created[0]?.input;
    expect(input?.memoryId).toBe("mem-1");
    expect(input?.actorId).toBe("a1");
    expect(input?.sessionId).toBe("s1");
    expect(input?.eventTimestamp).toBe(fixed);
    expect(input?.payload).toEqual([
      { conversational: { role: "USER", content: { text: "question" } } },
      { conversational: { role: "ASSISTANT", content: { text: "answer" } } },
    ]);
  });
});

describe("ConversationMemory.recentHistory", () => {
  test("includePayloads と maxResults を渡し、ソート整形して返す", async () => {
    const older = turnEvent("prev", "ok", "2026-06-14T00:00:01Z");
    const newer = turnEvent("now?", "yes", "2026-06-14T00:00:09Z");
    // 順序未規定を模して新→旧で返す。
    const client = new FakeMemoryClient([newer, older]);
    const memory = new ConversationMemory("mem-1", { client, maxResults: 50 });
    const history = await memory.recentHistory("a1", "s1");
    const input = client.listed[0]?.input;
    expect(input?.includePayloads).toBe(true);
    expect(input?.maxResults).toBe(50);
    // 昇順に整形される（古いターンが先）。
    expect(history).toBe(
      "User: prev\nAssistant: ok\nUser: now?\nAssistant: yes",
    );
  });

  test("recentTurns で直近 event だけに絞る", async () => {
    const events = [
      turnEvent("q1", "a1", "2026-06-14T00:00:01Z"),
      turnEvent("q2", "a2", "2026-06-14T00:00:02Z"),
      turnEvent("q3", "a3", "2026-06-14T00:00:03Z"),
    ];
    const client = new FakeMemoryClient(events);
    const memory = new ConversationMemory("mem-1", { client, recentTurns: 1 });
    const history = await memory.recentHistory("a1", "s1");
    expect(history).toBe("User: q3\nAssistant: a3");
  });
});
