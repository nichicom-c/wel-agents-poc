import { describe, expect, test } from "bun:test";

import { deriveRuntimeSessionId } from "../domain/auth.ts";
import {
  type BffDevConfig,
  handleBffDevRequest,
  resolveBffDevConfig,
} from "./dev-server.ts";

const CONFIG: BffDevConfig = {
  actorId: "web-user",
  agentCoreRuntimeUrl: "http://localhost:8080",
  authMode: "dev",
  devUserId: "local-user",
  host: "127.0.0.1",
  knowledgeBaseIds: {
    database: undefined,
    document: undefined,
    law: undefined,
    medical_care_law: undefined,
    support_activity: undefined,
  },
  port: 4174,
  region: "ap-northeast-1",
};

const CONFIG_WITH_KB_IDS: BffDevConfig = {
  ...CONFIG,
  knowledgeBaseIds: {
    database: "KBDB000001",
    document: "KBDOC00001",
    law: "KBLAW0001",
    medical_care_law: "KBMED00001",
    support_activity: "KBSUP00001",
  },
};

const CONFIG_WITHOUT_DEV_USER: BffDevConfig = {
  actorId: "web-user",
  agentCoreRuntimeUrl: "http://localhost:8080",
  authMode: "dev",
  host: "127.0.0.1",
  port: 4174,
  region: "ap-northeast-1",
  knowledgeBaseIds: {
    database: undefined,
    document: undefined,
    law: undefined,
    medical_care_law: undefined,
    support_activity: undefined,
  },
};

describe("resolveBffDevConfig", () => {
  test("既定値を返す", () => {
    expect(resolveBffDevConfig({})).toEqual(CONFIG);
  });

  test("local BFF 用 env を trim して読み取る", () => {
    expect(
      resolveBffDevConfig({
        AGENT_RUNTIME_REGION: " us-west-2 ",
        BFF_HOST: " 0.0.0.0 ",
        BFF_PORT: "5174",
        BFF_AUTH_MODE: " dev ",
        BFF_DEV_USER_ID: " local-user-2 ",
        DEV_INFO_AGENTCORE_MEMORY_ID: " memory-1 ",
        DEFAULT_ACTOR_ID: " actor-1 ",
        AGENTCORE_RUNTIME_URL: " http://127.0.0.1:9090 ",
        DEV_INFO_DATABASE_KB_ID: " KBDB000001 ",
        DEV_INFO_DOCUMENT_KB_ID: " KBDOC00001 ",
        DEV_INFO_LAW_KB_ID: " KBLAW0001 ",
        DEV_INFO_MEDICAL_CARE_LAW_KB_ID: " KBMED00001 ",
        DEV_INFO_SUPPORT_ACTIVITY_KB_ID: " KBSUP00001 ",
      }),
    ).toEqual({
      actorId: "actor-1",
      agentCoreRuntimeUrl: "http://127.0.0.1:9090",
      agentCoreMemoryId: "memory-1",
      authMode: "dev",
      devUserId: "local-user-2",
      host: "0.0.0.0",
      port: 5174,
      region: "us-west-2",
      knowledgeBaseIds: {
        database: "KBDB000001",
        document: "KBDOC00001",
        law: "KBLAW0001",
        medical_care_law: "KBMED00001",
        support_activity: "KBSUP00001",
      },
    });
  });
});

describe("handleBffDevRequest", () => {
  test("BFF request を local runtime payload に変換する", async () => {
    let runtimeRequest: Record<string, unknown> | undefined;
    const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
      runtimeRequest = {
        body: JSON.parse(String(init?.body)),
        method: init?.method,
        url: String(url),
      };
      return Response.json({
        response: "answer",
        session_id: "chat-00000000-0000-4000-8000-000000000000",
        status: "success",
      });
    };

    const response = await handleBffDevRequest(
      new Request("http://localhost:4174/api/chat", {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
          message: "hello",
        }),
        method: "POST",
      }),
      CONFIG,
      fetchFn,
    );

    await expect(response.json()).resolves.toEqual({
      conversationId: "chat-00000000-0000-4000-8000-000000000000",
      response: "answer",
      runtime: {
        response: "answer",
        session_id: "chat-00000000-0000-4000-8000-000000000000",
        status: "success",
      },
    });
    expect(response.status).toBe(200);
    expect(runtimeRequest).toEqual({
      body: {
        actor_id: "web-user",
        prompt: "hello",
        session_id: "chat-00000000-0000-4000-8000-000000000000",
      },
      method: "POST",
      url: "http://localhost:8080/invocations",
    });
  });

  test("不正な conversationId を 400 にする", async () => {
    const response = await handleBffDevRequest(
      new Request("http://localhost:4174/api/chat", {
        body: JSON.stringify({
          conversationId: "short",
          message: "hello",
        }),
        method: "POST",
      }),
      CONFIG,
    );

    await expect(response.json()).resolves.toEqual({
      error:
        "conversationId must be 33-256 chars, start with an alphanumeric character, and contain only A-Z, a-z, 0-9, _ or -",
    });
    expect(response.status).toBe(400);
  });

  test("POST /api/ws-url に local WebSocket URL を返す", async () => {
    const response = await handleBffDevRequest(
      new Request("http://localhost:4174/api/ws-url", {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
        }),
        method: "POST",
      }),
      CONFIG,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      conversationId: string;
      expiresIn: number;
      webSocketUrl: string;
    };
    expect(body).toEqual({
      conversationId: "chat-00000000-0000-4000-8000-000000000000",
      expiresIn: 300,
      webSocketUrl: expect.stringMatching(
        /^ws:\/\/localhost:8080\/ws\?X-Amzn-Bedrock-AgentCore-Runtime-Session-Id=u[A-Za-z0-9_-]+-chat-/,
      ),
    });
    expect(
      new URL(body.webSocketUrl).searchParams.get(
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id",
      ),
    ).toMatch(/^u[A-Za-z0-9_-]+-chat-/);
    expect(
      new URL(body.webSocketUrl).searchParams.get(
        "X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId",
      ),
    ).toBe("u-local-user");
    expect(
      new URL(body.webSocketUrl).searchParams.get(
        "X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId",
      ),
    ).toBe("local-user");
  });

  test("POST /api/ws-url は dev user がなければ 401", async () => {
    const response = await handleBffDevRequest(
      new Request("http://localhost:4174/api/ws-url", {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
        }),
        method: "POST",
      }),
      CONFIG_WITHOUT_DEV_USER,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
  });

  test("GET /api/dev-info に local Dev Info を返す", async () => {
    let pingUrl = "";
    const fetchFn = async (url: string | URL | Request) => {
      pingUrl = String(url);
      return Response.json({ status: "healthy" });
    };

    const response = await handleBffDevRequest(
      new Request("http://localhost:4174/api/dev-info", {
        method: "GET",
      }),
      CONFIG,
      fetchFn,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      aws: {
        accountId: "unknown",
        region: "ap-northeast-1",
      },
      bff: {
        apiEndpoint: "http://localhost:4174",
        authMode: "dev",
      },
      runtime: {
        arn: "not_configured",
        health: {
          checkedAt: expect.any(String),
          status: "ok",
        },
        qualifier: "local",
      },
    });
    expect(pingUrl).toBe("http://localhost:8080/ping");
    expect(JSON.stringify(body)).not.toContain("webSocketUrl");
  });

  test("GET /api/knowledge-bases/:domain は local KB detail provider を呼ぶ", async () => {
    let overviewInput: Record<string, unknown> | undefined;
    const response = await handleBffDevRequest(
      new Request(
        "http://localhost:4174/api/knowledge-bases/medical_care_law",
        {
          method: "GET",
        },
      ),
      CONFIG_WITH_KB_IDS,
      fetch,
      {
        getKnowledgeBaseDetail: {
          getOverview: async (input) => {
            overviewInput = input;
            return {
              dataSources: [],
              domain: input.domain,
              knowledgeBase: {
                knowledgeBaseId: input.knowledgeBaseId,
                name: "medical-kb",
              },
              knowledgeBaseId: input.knowledgeBaseId,
            };
          },
          listDocuments: async () => {
            throw new Error("must not be called");
          },
        },
      },
    );

    expect(response.status).toBe(200);
    expect(overviewInput).toEqual({
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
    });
    expect(await response.json()).toMatchObject({
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
    });
  });

  test("GET /api/knowledge-bases/:domain documents route passes query", async () => {
    let documentsInput: Record<string, unknown> | undefined;
    const response = await handleBffDevRequest(
      new Request(
        "http://localhost:4174/api/knowledge-bases/medical_care_law/data-sources/DS12345678/documents?maxResults=25&nextToken=next-1",
        { method: "GET" },
      ),
      CONFIG_WITH_KB_IDS,
      fetch,
      {
        getKnowledgeBaseDetail: {
          getOverview: async () => {
            throw new Error("must not be called");
          },
          listDocuments: async (input) => {
            documentsInput = input;
            return {
              dataSourceId: input.dataSourceId,
              documents: [],
              domain: input.domain,
              knowledgeBaseId: input.knowledgeBaseId,
            };
          },
        },
      },
    );

    expect(response.status).toBe(200);
    expect(documentsInput).toEqual({
      dataSourceId: "DS12345678",
      domain: "medical_care_law",
      knowledgeBaseId: "KBMED00001",
      maxResults: 25,
      nextToken: "next-1",
    });
  });

  test("GET /api/dev-info は dev user がなければ 401", async () => {
    const response = await handleBffDevRequest(
      new Request("http://localhost:4174/api/dev-info", {
        method: "GET",
      }),
      CONFIG_WITHOUT_DEV_USER,
      async () => {
        throw new Error("must not be called");
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "authentication required",
    });
  });

  test("GET /api/sessions は local dev user の AgentCore sessions を返す", async () => {
    const runtimeSessionId = deriveRuntimeSessionId(
      "local-user",
      "chat-00000000-0000-4000-8000-000000000000",
    );
    let listInput: Record<string, unknown> | undefined;

    const response = await handleBffDevRequest(
      new Request("http://localhost:4174/api/sessions", {
        method: "GET",
      }),
      {
        ...CONFIG,
        agentCoreMemoryId: "memory-1",
      },
      fetch,
      {
        listSessions: async (input) => {
          listInput = input;
          return {
            memoryId: "memory-1",
            sessions: [
              {
                actorId: "u-local-user",
                createdAt: "2026-06-17T02:00:00.000Z",
                runtimeSessionId,
              },
            ],
            truncated: false,
          };
        },
      },
    );

    expect(response.status).toBe(200);
    expect(listInput).toEqual({ actorId: "u-local-user" });
    expect(await response.json()).toEqual({
      memoryId: "memory-1",
      sessions: [
        {
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
          createdAt: "2026-06-17T02:00:00.000Z",
        },
      ],
      truncated: false,
    });
  });

  test("GET /api/sessions は Memory ID がなければ 503", async () => {
    const response = await handleBffDevRequest(
      new Request("http://localhost:4174/api/sessions", {
        method: "GET",
      }),
      CONFIG,
      fetch,
      {
        listSessions: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "AgentCore Memory ID is not configured",
    });
  });
});
