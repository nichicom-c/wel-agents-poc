/**
 * Chat UI から使う local BFF dev server。
 *
 * production Lambda と同じ BFF contract を `Bun.serve` で公開し、`POST /api/chat` を
 * local AgentCore Runtime の `/invocations` へ forward する。Vite dev server からの
 * browser request を受けるため、ここでは CORS header も付与する。
 */

import { handleDevInfoRequest } from "../application/handle-dev-info-request.ts";
import {
  handleKnowledgeBaseDetailRequest,
  type KnowledgeBaseDetailProvider,
} from "../application/handle-knowledge-base-detail-request.ts";
import { handleBffRequest } from "../application/handle-request.ts";
import {
  handleSessionsRequest,
  type ListSessions,
} from "../application/handle-sessions-request.ts";
import { handleWsUrlRequest } from "../application/handle-ws-url-request.ts";
import { runtimeInvokeResultFromResponse } from "../application/runtime-response.ts";
import type { KnowledgeBaseIds } from "../contracts/knowledge-base-detail.ts";
import type { RuntimePayload } from "../contracts/runtime.ts";
import { authContextFromJwtClaims } from "../domain/auth.ts";
import { listAgentCoreSessions } from "../infra/agentcore-sessions-client.ts";
import { buildDevInfo } from "../infra/dev-info.ts";
import { makeKnowledgeBaseDetailProvider } from "../infra/knowledge-base-detail.ts";

const DEFAULT_ACTOR_ID = "web-user";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;
const DEFAULT_DEV_USER_ID = "local-user";
const DEFAULT_AGENTCORE_RUNTIME_URL = "http://localhost:8080";
const DEFAULT_REGION = "ap-northeast-1";
const AGENTCORE_SESSION_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id";
const AGENTCORE_CUSTOM_ACTOR_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId";
const AGENTCORE_CUSTOM_USER_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId";

export type BffDevAuthMode = "dev" | "jwt";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** local BFF dev server の起動設定。 */
export type BffDevConfig = {
  /** AgentCore Runtime に渡す actor_id。local UI では固定利用者として扱う。 */
  actorId: string;
  /** AWS ListSessions で参照する AgentCore Memory ID。未設定なら `/api/sessions` は 503。 */
  agentCoreMemoryId?: string;
  /** local URL issuer の認証 mode。local server は JWT 検証をしない。 */
  authMode: BffDevAuthMode;
  /** dev mode で認証済み user として扱う ID。 */
  devUserId?: string;
  /** Bun.serve が listen する hostname。既定は localhost のみ。 */
  host: string;
  /** Bun.serve が listen する port。 */
  port: number;
  /** AWS SDK client に渡す region。 */
  region: string;
  /** domain 別の Bedrock Knowledge Base ID。 */
  knowledgeBaseIds: KnowledgeBaseIds;
  /** forward 先の AgentCore Runtime base URL。 */
  agentCoreRuntimeUrl: string;
};

type BffDevDeps = {
  getKnowledgeBaseDetail?: KnowledgeBaseDetailProvider;
  listSessions?: ListSessions;
  logError?: (message: string, detail: Record<string, unknown>) => void;
};

/**
 * local BFF 用の環境変数から起動設定を組み立てる。
 *
 * 空文字・空白のみの値は未設定扱いにし、`BFF_PORT` は正の整数だけ採用する。
 * テストでは任意の env object を渡して `process.env` への依存を避けられる。
 */
export function resolveBffDevConfig(
  env: NodeJS.ProcessEnv = process.env,
): BffDevConfig {
  const authMode = authModeFromEnv(env.BFF_AUTH_MODE);
  const devUserId = clean(env.BFF_DEV_USER_ID) || DEFAULT_DEV_USER_ID;
  const agentCoreMemoryId =
    clean(env.DEV_INFO_AGENTCORE_MEMORY_ID) || clean(env.AGENTCORE_MEMORY_ID);

  return {
    actorId: clean(env.DEFAULT_ACTOR_ID) || DEFAULT_ACTOR_ID,
    ...(agentCoreMemoryId ? { agentCoreMemoryId } : {}),
    authMode,
    ...(authMode === "dev" ? { devUserId } : {}),
    host: clean(env.BFF_HOST) || DEFAULT_HOST,
    knowledgeBaseIds: knowledgeBaseIdsFromEnv(env),
    port: positiveInt(env.BFF_PORT) || DEFAULT_PORT,
    region:
      clean(env.AGENT_RUNTIME_REGION) ||
      clean(env.AWS_REGION) ||
      clean(env.AWS_DEFAULT_REGION) ||
      DEFAULT_REGION,
    agentCoreRuntimeUrl:
      clean(env.AGENTCORE_RUNTIME_URL) || DEFAULT_AGENTCORE_RUNTIME_URL,
  };
}

/** `BffDevConfig` に従って local BFF dev server を起動する。 */
export function startBffDevServer(config = resolveBffDevConfig()) {
  const server = Bun.serve({
    fetch: (request) => handleBffDevRequest(request, config),
    hostname: config.host,
    port: config.port,
  });

  console.log(
    `[INFO] BFF dev server: http://${server.hostname}:${server.port}/`,
  );
  console.log(
    `[INFO] /api/chat -> ${joinUrl(config.agentCoreRuntimeUrl, "/invocations")}`,
  );

  return server;
}

/**
 * Bun の Request を shared BFF contract に変換して処理する fetch handler。
 *
 * `fetchFn` を差し替えると AgentCore Runtime を起動せずに forward 層を単体テストできる。
 */
export async function handleBffDevRequest(
  request: Request,
  config: BffDevConfig,
  fetchFn: FetchFn = fetch,
  deps: BffDevDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const body = await request.text();

  if (request.method === "GET" && url.pathname === "/api/dev-info") {
    const bffResponse = await handleDevInfoRequest(
      {
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        getDevInfo: () =>
          buildDevInfo(
            {
              authMode: config.authMode,
              databaseKbId: config.knowledgeBaseIds.database,
              documentKbId: config.knowledgeBaseIds.document,
              lawKbId: config.knowledgeBaseIds.law,
              localRuntimeUrl: config.agentCoreRuntimeUrl,
              medicalCareLawKbId: config.knowledgeBaseIds.medical_care_law,
              memoryId: config.agentCoreMemoryId,
              region: config.region,
              runtimeArn: "",
              runtimeEndpointName: "local",
              runtimeQualifier: "local",
              supportActivityKbId: config.knowledgeBaseIds.support_activity,
            },
            {
              fetchFn,
              requestUrl: request.url,
            },
          ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/api/knowledge-bases/")
  ) {
    const bffResponse = await handleKnowledgeBaseDetailRequest(
      {
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        getKnowledgeBaseDetail:
          deps.getKnowledgeBaseDetail ??
          makeKnowledgeBaseDetailProvider({ region: config.region }),
        knowledgeBaseIds: config.knowledgeBaseIds,
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (request.method === "GET" && url.pathname === "/api/sessions") {
    const bffResponse = await handleSessionsRequest(
      {
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        listSessions:
          deps.listSessions ??
          (({ actorId }) =>
            listAgentCoreSessions(
              {
                memoryId: config.agentCoreMemoryId || "",
                region: config.region,
              },
              { actorId },
            )),
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
        memoryId: config.agentCoreMemoryId,
      },
    );

    return responseFromBff(bffResponse);
  }

  if (request.method === "POST" && url.pathname === "/api/ws-url") {
    const bffResponse = await handleWsUrlRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        createWebSocketUrl: async ({ actorId, runtimeSessionId, userId }) =>
          localWebSocketUrl(config.agentCoreRuntimeUrl, {
            actorId,
            runtimeSessionId,
            userId,
          }),
      },
    );

    return responseFromBff(bffResponse);
  }

  const bffResponse = await handleBffRequest(
    {
      body,
      method: request.method,
      path: url.pathname,
    },
    {
      actorId: config.actorId,
      invokeRuntime: (_runtimeSessionId, payload) =>
        invokeLocalRuntime(config, payload, fetchFn),
      logError: (message, detail) => console.error(message, detail),
    },
  );

  return responseFromBff(bffResponse);
}

function responseFromBff(bffResponse: {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
}): Response {
  return new Response(
    bffResponse.statusCode === 204 ? null : bffResponse.body,
    {
      headers: {
        ...corsHeaders(),
        ...bffResponse.headers,
      },
      status: bffResponse.statusCode,
    },
  );
}

/** shared BFF が組み立てた RuntimePayload を local Runtime の `/invocations` に送る。 */
async function invokeLocalRuntime(
  config: BffDevConfig,
  payload: RuntimePayload,
  fetchFn: FetchFn,
) {
  const upstream = await fetchFn(
    joinUrl(config.agentCoreRuntimeUrl, "/invocations"),
    {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  return runtimeInvokeResultFromResponse(upstream);
}

/** browser の local dev request を許可する CORS header。 */
function corsHeaders() {
  return {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": "*",
  };
}

/** trim 後に非空の文字列だけを返す（空文字・空白のみは未設定扱い）。 */
function clean(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function authModeFromEnv(value: string | undefined): BffDevAuthMode {
  const mode = clean(value) || "dev";
  if (mode === "dev" || mode === "jwt") {
    return mode;
  }
  throw new Error("BFF_AUTH_MODE must be jwt or dev");
}

function authContextForConfig(config: BffDevConfig) {
  return config.authMode === "dev" && config.devUserId
    ? authContextFromJwtClaims({ sub: config.devUserId })
    : undefined;
}

function knowledgeBaseIdsFromEnv(env: NodeJS.ProcessEnv): KnowledgeBaseIds {
  return {
    database: clean(env.DEV_INFO_DATABASE_KB_ID) || clean(env.DATABASE_KB_ID),
    document: clean(env.DEV_INFO_DOCUMENT_KB_ID) || clean(env.DOCUMENT_KB_ID),
    law: clean(env.DEV_INFO_LAW_KB_ID) || clean(env.LAW_KB_ID),
    medical_care_law:
      clean(env.DEV_INFO_MEDICAL_CARE_LAW_KB_ID) ||
      clean(env.MEDICAL_CARE_LAW_KB_ID),
    support_activity:
      clean(env.DEV_INFO_SUPPORT_ACTIVITY_KB_ID) ||
      clean(env.SUPPORT_ACTIVITY_KB_ID),
  };
}

function queryFromUrl(url: URL): Record<string, string | undefined> {
  return Object.fromEntries(url.searchParams.entries());
}

/** base URL 末尾の slash を 1 つにそろえて path を連結する。 */
function joinUrl(baseUrl: string, path: string) {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

function localWebSocketUrl(
  baseUrl: string,
  context: {
    actorId: string;
    runtimeSessionId: string;
    userId: string;
  },
): string {
  const url = new URL(joinUrl(baseUrl, "/ws"));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set(AGENTCORE_SESSION_ID_QUERY, context.runtimeSessionId);
  url.searchParams.set(AGENTCORE_CUSTOM_ACTOR_ID_QUERY, context.actorId);
  url.searchParams.set(AGENTCORE_CUSTOM_USER_ID_QUERY, context.userId);
  return url.toString();
}

/** 正の整数として解釈できる値だけを返す。 */
function positiveInt(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

if (import.meta.main) {
  startBffDevServer();
}
