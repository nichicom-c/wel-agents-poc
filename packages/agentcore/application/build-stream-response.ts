/**
 * streaming WebSocket 1 ターン分の応答生成を統括する application 層のオーケストレータ。
 *
 * WebSocket adapter（`handleWebSocketMessage`）から呼ばれ、config 検証 → prompt/actor/session
 * 解決 → Memory からの履歴ロード（best-effort）→ `ready` 送信 → supervisor stream の消費と
 * browser event への変換 → 最終回答の抽出 → `final` 送信 → Memory への保存（best-effort）、という
 * 固定の順序で 1 ターンを進める。生成した event はすべて `send`（{@link StreamSender}）経由で
 * ブラウザへ流すため、送信先（WebSocket / テストの収集器）にはこの層が依存しない。
 *
 * Memory の読み書きは best-effort で、失敗しても warn を出して会話自体は継続する（履歴が無い、
 * または保存されないだけで応答は返す）。
 */

import type { RuntimeRequest } from "../contracts/runtime.ts";
import type { AgentToBrowserMessage } from "../contracts/websocket.ts";
import {
  composeMessage,
  getActorId,
  getPrompt,
  getSessionId,
} from "../domain/session.ts";
import { type Config, configFromEnv, missingConfig } from "../infra/config.ts";
import { ConversationMemory, type MemoryStore } from "../infra/memory.ts";
import { streamEventToServerEvent } from "./stream-events.ts";
import { type AgentDeps, buildSupervisor } from "./supervisor-agent.ts";

/** 生成した browser 向け event を 1 件ずつ送出する sink（WebSocket への送信などを注入する seam）。 */
export type StreamSender = (
  event: AgentToBrowserMessage,
) => void | Promise<void>;

/**
 * supervisor の streaming 実行を表す seam。入力メッセージから Strands stream event の
 * AsyncGenerator を返す。本番では {@link defaultSupervisorStreamer} が実 supervisor を包み、
 * テストでは fake を注入する。
 */
export type SupervisorStreamer = (
  message: string,
  options?: { cancelSignal?: AbortSignal },
) => AsyncGenerator<unknown, unknown, undefined>;

/**
 * {@link streamResponse} の依存。すべて省略可能で、省略時は本番既定（環境変数 / 実 supervisor /
 * console.warn / cancellation 無し）に解決される。テストでは各 seam に fake を注入する。
 */
export type StreamRuntimeDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** supervisor stream 実行（省略時は config から本物の supervisor を生成）。 */
  supervisorStreamer?: SupervisorStreamer;
  /** 会話 Memory。undefined なら config.memoryId から自動生成、null なら履歴なしを強制。 */
  memory?: MemoryStore | null;
  /** best-effort 失敗時の警告出力（省略時は console.warn）。 */
  warn?: (message: string) => void;
  /** client disconnect など外部要因の cancellation signal。 */
  cancelSignal?: AbortSignal;
};

/** error 値を log 用の文字列に正規化する（Error なら message、それ以外は String 化）。 */
function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** config から本物の supervisor を生成し、その `stream` を {@link SupervisorStreamer} として返す。 */
function defaultSupervisorStreamer(config: Config): SupervisorStreamer {
  const deps: AgentDeps = { config };
  const supervisor = buildSupervisor(deps);
  return (message, options) => supervisor.stream(message, options);
}

/**
 * 1 ターンの streaming 応答を生成し、進行に応じた event を `send` で送出する。
 *
 * 早期リターン: config 不足または prompt 欠落のときは `error` event を 1 件送って終了する
 * （以降の stream / Memory 処理は行わない）。
 *
 * 正常系の送出順は `ready` → 0 件以上の `delta` / `tool_start` / `tool_end` → `final`。中間 event は
 * supervisor の stream を {@link consumeStream} で消費しつつ {@link streamEventToServerEvent} で
 * 変換して流す。`final` には抽出した最終回答（{@link extractLastMessageText}）と session ID・modelId
 * を載せる。
 *
 * 履歴は stream 開始前に Memory から読み（{@link composeMessage} で prompt に前置き）、`final` 送出後に
 * このターンを保存する。Memory の読み書きは best-effort で、失敗時は warn のみで継続する。最終回答が
 * 空文字列のときも警告するだけで `final` は送る。
 *
 * @param payload AgentCore Runtime への入力（prompt / actor_id / session_id 等）。
 * @param send 生成した browser event を送出する sink。
 * @param deps 注入可能な依存（省略時は本番既定に解決）。
 */
export async function streamResponse(
  payload: RuntimeRequest,
  send: StreamSender,
  deps: StreamRuntimeDeps = {},
): Promise<void> {
  const config = deps.config ?? configFromEnv();
  const missing = missingConfig(config);
  if (missing.length > 0) {
    await send({
      type: "error",
      message: `Missing required configuration: ${missing.join(", ")}`,
    });
    return;
  }

  const prompt = getPrompt(payload);
  if (prompt === undefined) {
    await send({ type: "error", message: "Missing required field: prompt" });
    return;
  }

  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);
  const warn = deps.warn ?? ((message: string) => console.warn(message));

  let memory = deps.memory;
  if (memory === undefined) {
    memory = config.memoryId
      ? new ConversationMemory(config.memoryId, { region: config.region })
      : null;
  }

  let history = "";
  if (memory) {
    try {
      history = await memory.recentHistory(actorId, sessionId);
    } catch (error) {
      warn(`[WARNING] memory recentHistory failed: ${stringifyError(error)}`);
    }
  }

  await send({ type: "ready", conversationId: sessionId });

  const stream = deps.supervisorStreamer ?? defaultSupervisorStreamer(config);
  const result = await consumeStream(
    stream(composeMessage(prompt, history), {
      cancelSignal: deps.cancelSignal,
    }),
    send,
  );
  const answer = extractLastMessageText(result);

  if (!answer.trim()) {
    warn("[WARNING] supervisor returned an empty response");
  }

  await send({
    type: "final",
    response: answer,
    conversationId: sessionId,
    modelId: config.modelId,
  });

  if (memory) {
    try {
      await memory.saveTurn(actorId, sessionId, prompt, answer);
    } catch (error) {
      warn(`[WARNING] memory saveTurn failed: ${stringifyError(error)}`);
    }
  }
}

/**
 * supervisor の stream を最後まで消費し、各 event を browser event に変換して `send` する。
 *
 * 変換結果が undefined（browser へ転送しない event）の場合は送らずに読み進める。generator が
 * done になったら、その戻り値（最終 result）をそのまま返す。
 */
async function consumeStream(
  iterator: AsyncGenerator<unknown, unknown, undefined>,
  send: StreamSender,
): Promise<unknown> {
  while (true) {
    const result = await iterator.next();

    if (result.done) {
      return result.value;
    }

    const event = streamEventToServerEvent(result.value);
    if (event) {
      await send(event);
    }
  }
}

/**
 * stream の最終 result から assistant の最終メッセージ本文を取り出す。
 *
 * `lastMessage.content` の `textBlock` だけを順に改行区切りで連結して返す。期待する構造でない、
 * または text block が無い場合は空文字列を返す。
 */
function extractLastMessageText(result: unknown): string {
  const lastMessage = asRecord(asRecord(result).lastMessage);
  const content = lastMessage.content;

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const block of content) {
    const record = asRecord(block);
    if (record.type === "textBlock" && typeof record.text === "string") {
      parts.push(record.text);
    }
  }

  return parts.join("\n");
}

/** object 以外（null / 配列 / primitive）を空 record として扱い、unknown を安全に読む。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
