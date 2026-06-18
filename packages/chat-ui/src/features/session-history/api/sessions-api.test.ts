import { describe, expect, test } from "bun:test";

import {
  AgentCoreMemoryNotConfiguredError,
  requestAwsSessions,
} from "./sessions-api.ts";

describe("requestAwsSessions", () => {
  test("GET /api/sessions の response を正規化する", async () => {
    let request: Record<string, unknown> | undefined;
    const result = await requestAwsSessions({
      accessToken: " token-1 ",
      fetchFn: async (url, init) => {
        request = {
          headers: init?.headers,
          method: init?.method,
          url: String(url),
        };
        return Response.json({
          memoryId: "memory-1",
          sessions: [
            {
              conversationId: "chat-00000000-0000-4000-8000-000000000000",
              createdAt: "2026-06-17T02:00:00.000Z",
            },
            {
              conversationId: "",
              createdAt: "2026-06-17T01:00:00.000Z",
            },
          ],
          truncated: true,
        });
      },
    });

    expect(request).toEqual({
      headers: {
        authorization: "Bearer token-1",
      },
      method: "GET",
      url: "/api/sessions",
    });
    expect(result).toEqual({
      memoryId: "memory-1",
      sessions: [
        {
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
          createdAt: "2026-06-17T02:00:00.000Z",
        },
      ],
      truncated: true,
    });
  });

  test("HTTP error は message として返す", async () => {
    await expect(
      requestAwsSessions({
        accessToken: "token-1",
        fetchFn: async () =>
          Response.json(
            { error: "AgentCore sessions list failed" },
            { status: 502 },
          ),
      }),
    ).rejects.toThrow("AgentCore sessions list failed");
  });

  test("Memory ID 未設定は専用 error として返す", async () => {
    await expect(
      requestAwsSessions({
        accessToken: "token-1",
        fetchFn: async () =>
          Response.json(
            { error: "AgentCore Memory ID is not configured" },
            { status: 503 },
          ),
      }),
    ).rejects.toBeInstanceOf(AgentCoreMemoryNotConfiguredError);
  });
});
