import { describe, expect, test } from "bun:test";
import type { ListSessionsCommandOutput } from "@aws-sdk/client-bedrock-agentcore";

import { listAgentCoreSessions } from "./agentcore-sessions-client.ts";

describe("listAgentCoreSessions", () => {
  test("ListSessions command を作り、session summary を新しい順に正規化する", async () => {
    let commandInput: Record<string, unknown> | undefined;

    const result = await listAgentCoreSessions(
      {
        maxResults: 24,
        memoryId: "memory-1",
        region: "ap-northeast-1",
      },
      { actorId: "u-user-123" },
      {
        sender: async (command) => {
          commandInput = command.input as unknown as Record<string, unknown>;
          return {
            $metadata: {},
            sessionSummaries: [
              {
                actorId: "u-user-123",
                createdAt: new Date("2026-06-17T01:00:00.000Z"),
                sessionId: "uabc-chat-older",
              },
              {
                actorId: "u-user-123",
                createdAt: new Date("2026-06-17T02:00:00.000Z"),
                sessionId: "uabc-chat-newer",
              },
            ],
          } as ListSessionsCommandOutput;
        },
      },
    );

    expect(commandInput).toEqual({
      actorId: "u-user-123",
      filter: { eventFilter: "HAS_EVENTS" },
      maxResults: 24,
      memoryId: "memory-1",
    });
    expect(result).toEqual({
      memoryId: "memory-1",
      sessions: [
        {
          actorId: "u-user-123",
          createdAt: "2026-06-17T02:00:00.000Z",
          runtimeSessionId: "uabc-chat-newer",
        },
        {
          actorId: "u-user-123",
          createdAt: "2026-06-17T01:00:00.000Z",
          runtimeSessionId: "uabc-chat-older",
        },
      ],
      truncated: false,
    });
  });

  test("nextToken があれば truncated として返す", async () => {
    const result = await listAgentCoreSessions(
      {
        memoryId: "memory-1",
        region: "ap-northeast-1",
      },
      { actorId: "u-user-123" },
      {
        sender: async () =>
          ({
            $metadata: {},
            nextToken: "next",
            sessionSummaries: [],
          }) as ListSessionsCommandOutput,
      },
    );

    expect(result.truncated).toBe(true);
  });
});
