import { describe, expect, test } from "bun:test";
import type { InvokeAgentRuntimeCommandOutput } from "@aws-sdk/client-bedrock-agentcore";

import { deriveRuntimeSessionId } from "../domain/auth.ts";
import { configFromEnv, handleLambdaEvent } from "./lambda.ts";

const ENV = {
  AGENT_RUNTIME_ARN:
    "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
  AGENT_RUNTIME_ID: "runtime-abc",
  AGENT_RUNTIME_QUALIFIER: "sample",
  AGENT_RUNTIME_REGION: "ap-northeast-1",
  DEFAULT_ACTOR_ID: "web-user",
};

const DEV_INFO_ENV = {
  ...ENV,
  AWS_LAMBDA_FUNCTION_NAME: "wel-agents-bff",
  DEV_INFO_AGENTCORE_MEMORY_ID: "memory-1",
  DEV_INFO_AUTH_CLIENT_ID: "client-1",
  DEV_INFO_DATABASE_KB_ID: "KB002",
  DEV_INFO_DOCUMENT_KB_ID: "KB003",
  DEV_INFO_LAW_KB_ID: "KB004",
  DEV_INFO_MEDICAL_CARE_LAW_KB_ID: "KB005",
  DEV_INFO_SUPPORT_ACTIVITY_KB_ID: "KB006",
  DEV_INFO_JWT_ISSUER: "https://issuer.example",
  DEV_INFO_LAMBDA_LOG_GROUP_NAME: "/aws/lambda/wel-agents-bff",
};

describe("configFromEnv", () => {
  test("Lambda env を読み取る", () => {
    expect(configFromEnv(ENV)).toEqual({
      actorId: "web-user",
      actorClaim: "sub",
      authMode: "jwt",
      qualifier: "sample",
      region: "ap-northeast-1",
      requestTimeoutMs: 28000,
      runtimeArn:
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
      userIdClaim: "sub",
      devInfo: {
        authClientId: undefined,
        authMode: "jwt",
        databaseKbId: undefined,
        documentKbId: undefined,
        lawKbId: undefined,
        medicalCareLawKbId: undefined,
        supportActivityKbId: undefined,
        jwtIssuer: undefined,
        lambdaFunctionName: undefined,
        lambdaLogGroupName: undefined,
        memoryId: undefined,
        region: "ap-northeast-1",
        runtimeArn:
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
        runtimeEndpointName: "sample",
        runtimeQualifier: "sample",
      },
    });
  });

  test("JWT / dev auth env を trim して読み取る", () => {
    const config = configFromEnv({
      ...ENV,
      BFF_ACTOR_CLAIM: " custom:actor ",
      BFF_AUTH_MODE: " dev ",
      BFF_DEV_USER_ID: " local-user ",
      BFF_USER_ID_CLAIM: " username ",
      WS_URL_EXPIRES_SECONDS: " 120 ",
    });

    expect(config).toMatchObject({
      actorClaim: "custom:actor",
      authMode: "dev",
      devUserId: "local-user",
      userIdClaim: "username",
      wsUrlExpiresSeconds: 120,
    });
  });

  test("Dev Info 用の non-secret env を読み取る", () => {
    expect(configFromEnv(DEV_INFO_ENV).devInfo).toEqual({
      authClientId: "client-1",
      authMode: "jwt",
      databaseKbId: "KB002",
      documentKbId: "KB003",
      lawKbId: "KB004",
      medicalCareLawKbId: "KB005",
      supportActivityKbId: "KB006",
      jwtIssuer: "https://issuer.example",
      lambdaFunctionName: "wel-agents-bff",
      lambdaLogGroupName: "/aws/lambda/wel-agents-bff",
      memoryId: "memory-1",
      region: "ap-northeast-1",
      runtimeArn:
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
      runtimeEndpointName: "sample",
      runtimeQualifier: "sample",
    });
  });
});

describe("handleLambdaEvent", () => {
  test("GET /ping に healthy response を返す", async () => {
    const response = await handleLambdaEvent(
      {
        rawPath: "/ping",
        requestContext: { http: { method: "GET" } },
      },
      ENV,
      {
        sender: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: "healthy",
      time_of_last_update: expect.any(Number),
    });
  });

  test("GET /api/dev-info は JWT claims から認証コンテキストを作る", async () => {
    const response = await handleLambdaEvent(
      {
        headers: {
          host: "api.example.com",
          "x-forwarded-proto": "https",
        },
        rawPath: "/api/dev-info",
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                email: "u@example.com",
                sub: "user-123",
              },
            },
          },
          http: { method: "GET" },
        },
      },
      DEV_INFO_ENV,
      {
        getCallerIdentity: async () => ({ accountId: "210987654321" }),
      },
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      auth: {
        clientId: "client-1",
        jwtIssuer: "https://issuer.example",
      },
      aws: {
        accountId: "210987654321",
        region: "ap-northeast-1",
      },
      bff: {
        apiEndpoint: "https://api.example.com",
        authMode: "jwt",
        lambdaFunctionName: "wel-agents-bff",
        lambdaLogGroupName: "/aws/lambda/wel-agents-bff",
      },
      knowledgeBases: {
        database: "KB002",
        document: "KB003",
        law: "KB004",
        medical_care_law: "KB005",
        support_activity: "KB006",
      },
      memory: { id: "memory-1" },
      runtime: {
        arn: "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
        endpointName: "sample",
        qualifier: "sample",
      },
    });
    expect(response.body).not.toContain("webSocketUrl");
    expect(response.body).not.toContain("X-Amz-");
  });

  test("GET /api/dev-info は JWT claims がなければ 401", async () => {
    const response = await handleLambdaEvent(
      {
        rawPath: "/api/dev-info",
        requestContext: { http: { method: "GET" } },
      },
      DEV_INFO_ENV,
      {
        getCallerIdentity: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "authentication required",
    });
  });

  test("POST /api/ws-url は JWT claims から認証コンテキストを作る", async () => {
    let presignInput: Record<string, unknown> | undefined;

    const response = await handleLambdaEvent(
      {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
        }),
        rawPath: "/api/ws-url",
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                email: "u@example.com",
                sub: "user-123",
              },
            },
          },
          http: { method: "POST" },
        },
      },
      ENV,
      {
        createWebSocketUrl: async (input) => {
          presignInput = input;
          return `wss://example.test/ws?session=${input.runtimeSessionId}`;
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      conversationId: "chat-00000000-0000-4000-8000-000000000000",
      expiresIn: 300,
      webSocketUrl: expect.stringMatching(
        /^wss:\/\/example\.test\/ws\?session=u[A-Za-z0-9_-]+-chat-/,
      ),
    });
    expect(presignInput).toEqual({
      actorId: "u-user-123",
      conversationId: "chat-00000000-0000-4000-8000-000000000000",
      expiresIn: 300,
      qualifier: "sample",
      runtimeSessionId: expect.stringMatching(/^u[A-Za-z0-9_-]+-chat-/),
      userId: "user-123",
    });
  });

  test("POST /api/ws-url の既定 presigner は qualifier を URL に含める", async () => {
    const response = await handleLambdaEvent(
      {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
        }),
        rawPath: "/api/ws-url",
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                email: "u@example.com",
                sub: "user-123",
              },
            },
          },
          http: { method: "POST" },
        },
      },
      ENV,
      {
        webSocketPresignerDeps: {
          credentials: {
            accessKeyId: "AKIDEXAMPLE",
            secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
          },
          signingDate: new Date("2026-06-15T00:00:00.000Z"),
        },
      },
    );

    const body = JSON.parse(response.body);
    const webSocketUrl = new URL(body.webSocketUrl);

    expect(response.statusCode).toBe(200);
    expect(webSocketUrl.searchParams.get("qualifier")).toBe("sample");
  });

  test("POST /api/ws-url は JWT claims がなければ 401", async () => {
    const response = await handleLambdaEvent(
      {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
        }),
        rawPath: "/api/ws-url",
        requestContext: { http: { method: "POST" } },
      },
      ENV,
      {
        createWebSocketUrl: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "authentication required",
    });
  });

  test("GET /api/sessions は JWT claims から actor の AgentCore sessions を取得する", async () => {
    const runtimeSessionId = deriveRuntimeSessionId(
      "user-123",
      "chat-00000000-0000-4000-8000-000000000000",
    );
    let listInput: Record<string, unknown> | undefined;

    const response = await handleLambdaEvent(
      {
        rawPath: "/api/sessions",
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: "user-123",
              },
            },
          },
          http: { method: "GET" },
        },
      },
      DEV_INFO_ENV,
      {
        listSessions: async (input) => {
          listInput = input;
          return {
            memoryId: "memory-1",
            sessions: [
              {
                actorId: "u-user-123",
                createdAt: "2026-06-17T02:00:00.000Z",
                runtimeSessionId,
              },
            ],
            truncated: false,
          };
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(listInput).toEqual({ actorId: "u-user-123" });
    expect(JSON.parse(response.body)).toEqual({
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

  test("GET /api/knowledge-bases/:domain は JWT claims から認証して KB detail を返す", async () => {
    let overviewInput: Record<string, unknown> | undefined;
    const response = await handleLambdaEvent(
      {
        rawPath: "/api/knowledge-bases/medical_care_law",
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: "user-123",
              },
            },
          },
          http: { method: "GET" },
        },
      },
      DEV_INFO_ENV,
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

    expect(response.statusCode).toBe(200);
    expect(overviewInput).toEqual({
      domain: "medical_care_law",
      knowledgeBaseId: "KB005",
    });
    expect(JSON.parse(response.body)).toMatchObject({
      domain: "medical_care_law",
      knowledgeBaseId: "KB005",
    });
  });

  test("GET /api/sessions は JWT claims がなければ 401", async () => {
    const response = await handleLambdaEvent(
      {
        rawPath: "/api/sessions",
        requestContext: { http: { method: "GET" } },
      },
      DEV_INFO_ENV,
      {
        listSessions: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "authentication required",
    });
  });

  test("API Gateway event を AgentCore Runtime SDK command に変換する", async () => {
    let commandInput: Record<string, unknown> | undefined;

    const response = await handleLambdaEvent(
      {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
          message: "hello",
        }),
        rawPath: "/api/chat",
        requestContext: { http: { method: "POST" } },
      },
      ENV,
      {
        sender: async (command) => {
          commandInput = command.input as Record<string, unknown>;

          return {
            $metadata: { httpStatusCode: 200 },
            contentType: "application/json",
            response: {
              transformToString: async () =>
                JSON.stringify({
                  response: "answer",
                  status: "success",
                }),
            },
            statusCode: 200,
          } as unknown as InvokeAgentRuntimeCommandOutput;
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      conversationId: "chat-00000000-0000-4000-8000-000000000000",
      response: "answer",
      runtime: {
        response: "answer",
        status: "success",
      },
    });
    expect(commandInput).toMatchObject({
      accept: "application/json",
      agentRuntimeArn:
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/runtime-abc",
      contentType: "application/json",
      qualifier: "sample",
      runtimeSessionId: "chat-00000000-0000-4000-8000-000000000000",
    });
    expect(
      JSON.parse(new TextDecoder().decode(commandInput?.payload as Uint8Array)),
    ).toEqual({
      actor_id: "web-user",
      prompt: "hello",
      session_id: "chat-00000000-0000-4000-8000-000000000000",
    });
  });

  test("SDK service error を BFF の 502 にする", async () => {
    const response = await handleLambdaEvent(
      {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
          message: "hello",
        }),
        rawPath: "/api/chat",
        requestContext: { http: { method: "POST" } },
      },
      ENV,
      {
        sender: async () => {
          throw Object.assign(new Error("runtime failed"), {
            $metadata: { httpStatusCode: 429 },
            name: "ThrottlingException",
          });
        },
      },
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      error: "AgentCore invoke failed",
      message: "runtime failed",
      statusCode: 429,
    });
  });

  test("timeout abort を BFF の 504 にする", async () => {
    const response = await handleLambdaEvent(
      {
        body: JSON.stringify({
          conversationId: "chat-00000000-0000-4000-8000-000000000000",
          message: "hello",
        }),
        rawPath: "/api/chat",
        requestContext: { http: { method: "POST" } },
      },
      ENV,
      {
        logError: () => undefined,
        sender: async () => {
          throw new DOMException("aborted", "AbortError");
        },
      },
    );

    expect(response.statusCode).toBe(504);
    expect(JSON.parse(response.body)).toEqual({
      error: "AgentCore invoke timed out",
    });
  });
});
