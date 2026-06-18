/**
 * Amazon Bedrock AgentCore Runtime の HTTP アダプタ（Bun ネイティブ server）。
 *
 * AgentCore Runtime の HTTP contract に従い、`GET /ping` と `POST /invocations` を
 * `0.0.0.0:${PORT:-8080}` で公開する。`/invocations` は AWS が binary payload を送るため、
 * body を arrayBuffer で受けて TextDecoder で decode し JSON として解釈する。ロジックは
 * runtime.buildResponse に委譲し、ここは contract への適合（decode / JSON 化 / 例外の封じ込め）
 * だけを担う。
 *
 * 設計判断: HTTP contract は 2 endpoint の単純な契約なので、Express を足さず Bun.serve で実装する。
 * 互換問題が出た場合は exact pin の express / @types/express へ切り替える（設計書の fallback）。
 */

import { buildResponse } from "../application/build-response.ts";
import { streamResponse } from "../application/build-stream-response.ts";
import type { Responder, RuntimeRequest } from "../contracts/runtime.ts";
import {
  encodeServerEvent,
  parseClientMessage,
} from "../contracts/websocket.ts";

export type { Responder } from "../contracts/runtime.ts";

const PORT = Number(process.env.PORT) || 8080;
const HOSTNAME = "0.0.0.0";
const AGENTCORE_SESSION_ID_HEADER =
  "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id";
const AGENTCORE_CUSTOM_ACTOR_ID_HEADER =
  "X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId";
const AGENTCORE_CUSTOM_USER_ID_HEADER =
  "X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId";

/**
 * WebSocket の idle 切断までの秒数。
 *
 * 法律 RAG などは supervisor → 専門エージェント → KB retrieve の多段で、専門エージェントが
 * 全文を生成し終えるまで delta が流れない無音区間が長く（実測で約 3 分のことがある）、Bun 既定の
 * 120 秒では `final` 到達前に WS が切れて「closed before final」になる。十分大きく取る（Bun 上限 960）。
 */
const WS_IDLE_TIMEOUT_SECONDS = Math.min(
  960,
  Number(process.env.WS_IDLE_TIMEOUT_SECONDS) || 600,
);

/** ストリーミング中の keepalive ping 間隔（ms）。idleTimeout より十分短く保つ。 */
const WS_KEEPALIVE_MS = 20_000;

export type AgentCoreWebSocketData = {
  actorId?: string;
  sessionId?: string;
  userId?: string;
};
type WebSocketStreamResponder = typeof streamResponse;

/**
 * catch した unknown な値を、応答に載せる人間可読なメッセージへ変換する。
 *
 * `Error` instance ならスタックを含めず `message` のみを取り出し、それ以外
 * （文字列 throw や非 Error の reject 値など）は `String()` で文字列化する。
 * decode 失敗・invocation 失敗のいずれの catch からも使う共通ヘルパー。
 */
function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** AgentCore の binary JSON body を decode して RuntimeRequest にする。 */
async function decodePayload(request: Request): Promise<RuntimeRequest> {
  const text = new TextDecoder().decode(await request.arrayBuffer());
  return text ? (JSON.parse(text) as RuntimeRequest) : {};
}

async function handleInvocation(
  request: Request,
  respond: Responder,
): Promise<Response> {
  let payload: RuntimeRequest;
  try {
    payload = await decodePayload(request);
  } catch (error) {
    return Response.json(
      {
        status: "error",
        error: `Invalid JSON payload: ${stringifyError(error)}`,
      },
      { status: 400 },
    );
  }

  try {
    return Response.json(await respond(payload));
  } catch (error) {
    // service を落とさず、構造化エラーで返す（AgentCore からは 5xx として観測される）。
    console.error("[NG] invocation failed:", error);
    return Response.json(
      { status: "error", error: stringifyError(error) },
      { status: 500 },
    );
  }
}

/**
 * AgentCore Runtime の HTTP contract を実装する fetch ハンドラ。
 * respond を差し替えると Bedrock を呼ばずに adapter 層だけを単体テストできる。
 */
export async function handleRequest(
  request: Request,
  respond: Responder = buildResponse,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/ping") {
    return Response.json({
      status: "Healthy",
      time_of_last_update: Math.floor(Date.now() / 1000),
    });
  }

  if (request.method === "POST" && pathname === "/invocations") {
    return handleInvocation(request, respond);
  }

  return new Response("Not Found", { status: 404 });
}

/** WebSocket handshake に付与された AgentCore runtime session ID を取り出す。 */
export function resolveWebSocketSessionId(
  request: Request,
): string | undefined {
  return resolveWebSocketContext(request).sessionId;
}

/** WebSocket handshake に付与された AgentCore runtime context を取り出す。 */
export function resolveWebSocketContext(
  request: Request,
): AgentCoreWebSocketData {
  const url = new URL(request.url);
  return {
    ...contextField("actorId", request, url, AGENTCORE_CUSTOM_ACTOR_ID_HEADER),
    ...contextField("sessionId", request, url, AGENTCORE_SESSION_ID_HEADER),
    ...contextField("userId", request, url, AGENTCORE_CUSTOM_USER_ID_HEADER),
  };
}

export async function handleWebSocketMessage(
  ws: Bun.ServerWebSocket<AgentCoreWebSocketData>,
  raw: string | BufferSource,
  respondStream: WebSocketStreamResponder = streamResponse,
): Promise<void> {
  const parsed = parseClientMessage(rawToMessageBytes(raw));

  if (!parsed.ok) {
    ws.send(encodeServerEvent({ type: "error", message: parsed.error }));
    ws.close(parsed.error.includes("32KB") ? 1009 : 1008, parsed.error);
    return;
  }

  if (parsed.value.type === "ping") {
    ws.send(
      encodeServerEvent({
        type: "ready",
        conversationId: ws.data.sessionId ?? "",
      }),
    );
    return;
  }

  const payload: RuntimeRequest = {
    ...(ws.data.actorId ? { actor_id: ws.data.actorId } : {}),
    ...(ws.data.userId ? { user_id: ws.data.userId } : {}),
    prompt: parsed.value.message,
    session_id: ws.data.sessionId ?? parsed.value.conversationId,
  };

  // 専門エージェントの生成など delta が流れない無音区間でも WS が idle 切断されないよう、
  // ストリーミング中は定期 ping を送る。ブラウザが自動返信する pong が idle タイマーをリセットする。
  const keepalive = setInterval(() => {
    try {
      ws.ping();
    } catch {
      // 送信不能（既にクローズ済み等）は無視。直後の clearInterval で停止する。
    }
  }, WS_KEEPALIVE_MS);

  try {
    await respondStream(payload, (event) => {
      ws.send(encodeServerEvent(event));
    });
  } finally {
    clearInterval(keepalive);
  }

  // final 送信後はサーバ側からも明示的にクローズし、接続を残さない（例外時は呼び出し側の catch が 1011 で閉じる）。
  ws.close(1000, "complete");
}

/** `Bun.serve` で AgentCore Runtime HTTP adapter を起動する。 */
export function startAgentCoreServer() {
  const server = Bun.serve<AgentCoreWebSocketData>({
    port: PORT,
    hostname: HOSTNAME,
    fetch: (req, server) => {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/ws") {
        const upgraded = server.upgrade(req, {
          data: resolveWebSocketContext(req),
        });
        if (upgraded) {
          return;
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return handleRequest(req);
    },
    websocket: {
      // Bun 既定の idleTimeout(120s) は多段 RAG の長い生成に足りないため明示的に延ばす。
      idleTimeout: WS_IDLE_TIMEOUT_SECONDS,
      async message(ws, message) {
        try {
          await handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error("[NG] websocket message failed:", error);
          try {
            ws.send(
              encodeServerEvent({
                type: "error",
                message: stringifyError(error),
              }),
            );
          } catch {
            // 既にクローズ済みで送信できない場合は無視する。
          }
          ws.close(1011, "internal server error");
        }
      },
    },
  });
  console.log(
    `AgentCore Runtime server listening on http://${HOSTNAME}:${PORT}`,
  );
  console.log("  GET  /ping");
  console.log("  POST /invocations");
  console.log("  GET  /ws");
  return server;
}

function clean(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function contextField<K extends keyof AgentCoreWebSocketData>(
  key: K,
  request: Request,
  url: URL,
  headerName: string,
): Partial<Pick<AgentCoreWebSocketData, K>> {
  const value =
    clean(url.searchParams.get(headerName)) ??
    clean(request.headers.get(headerName));
  return value ? ({ [key]: value } as Pick<AgentCoreWebSocketData, K>) : {};
}

function rawToMessageBytes(raw: string | BufferSource): string | Uint8Array {
  if (typeof raw === "string") {
    return raw;
  }

  if (raw instanceof Uint8Array) {
    return raw;
  }

  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }

  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

// adapter を直接実行した場合も root entrypoint と同じ server を起動できるようにする。
if (import.meta.main) {
  startAgentCoreServer();
}
