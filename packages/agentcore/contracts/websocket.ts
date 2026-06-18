import { isRuntimeSessionId } from "../domain/session.ts";

/** ブラウザから受け付ける `user_message` 本文の最大 UTF-8 byte 数。 */
export const MAX_WEBSOCKET_MESSAGE_BYTES = 32 * 1024;

/** ブラウザから AgentCore WebSocket adapter へ送られる入力 event。 */
export type BrowserToAgentMessage =
  | {
      /** supervisor に渡す利用者発話。 */
      type: "user_message";
      /** trim 後に supervisor へ渡す本文。 */
      message: string;
      /** browser が保持する AgentCore Runtime session ID。 */
      conversationId: string;
    }
  | {
      /** 接続確認用 event。server は `ready` を返す。 */
      type: "ping";
    };

/** AgentCore WebSocket adapter からブラウザへ送る出力 event。 */
export type AgentToBrowserMessage =
  /** WebSocket 接続が会話 ID を確定できたことを通知する。 */
  | { type: "ready"; conversationId: string }
  /** streaming 応答の増分テキスト。 */
  | { type: "delta"; text: string }
  /** supervisor が専門 tool の実行を開始したことを通知する。 */
  | { type: "tool_start"; name: string }
  /** 専門 tool の実行完了と成否を通知する。 */
  | { type: "tool_end"; name: string; ok: boolean }
  /** supervisor の最終回答と会話メタデータ。 */
  | {
      type: "final";
      response: string;
      conversationId: string;
      modelId: string;
    }
  /** client に表示可能な処理エラー。 */
  | { type: "error"; message: string };

/** JSON payload の parse / validation 結果。 */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** WebSocket の raw message を browser 入力 contract として検証して返す。 */
export function parseClientMessage(
  raw: string | Uint8Array,
): ParseResult<BrowserToAgentMessage> {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "message must be valid JSON" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "message must be a JSON object" };
  }

  const record = parsed as Record<string, unknown>;

  if (record.type === "ping") {
    return { ok: true, value: { type: "ping" } };
  }

  if (record.type !== "user_message") {
    return { ok: false, error: "message type is unsupported" };
  }

  const message =
    typeof record.message === "string" ? record.message.trim() : "";
  if (!message) {
    return { ok: false, error: "message is required" };
  }

  if (
    new TextEncoder().encode(message).byteLength > MAX_WEBSOCKET_MESSAGE_BYTES
  ) {
    return { ok: false, error: "message exceeds 32KB limit" };
  }

  const conversationId =
    typeof record.conversationId === "string"
      ? record.conversationId.trim()
      : "";
  if (!isRuntimeSessionId(conversationId)) {
    return { ok: false, error: "conversationId is invalid" };
  }

  return {
    ok: true,
    value: {
      type: "user_message",
      message,
      conversationId,
    },
  };
}

/** server event を WebSocket で送信する JSON 文字列へ encode する。 */
export function encodeServerEvent(event: AgentToBrowserMessage): string {
  return JSON.stringify(event);
}
