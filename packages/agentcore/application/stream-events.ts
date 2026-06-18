import type { AgentToBrowserMessage } from "../contracts/websocket.ts";

/** Strands stream event をブラウザ向け WebSocket event に変換する。 */
export function streamEventToServerEvent(
  event: unknown,
): AgentToBrowserMessage | undefined {
  const record = asRecord(event);

  switch (record.type) {
    case "modelStreamUpdateEvent":
      return modelStreamEventToServerEvent(record.event);
    case "beforeToolCallEvent":
      return toolStartEvent(record);
    case "toolResultEvent":
      return toolEndEvent(record);
    default:
      return undefined;
  }
}

/** model stream の text delta だけを browser の `delta` event に変換する。 */
function modelStreamEventToServerEvent(
  event: unknown,
): AgentToBrowserMessage | undefined {
  const record = asRecord(event);
  if (record.type !== "modelContentBlockDeltaEvent") {
    return undefined;
  }

  const delta = asRecord(record.delta);
  if (delta.type !== "textDelta" || typeof delta.text !== "string") {
    return undefined;
  }

  return delta.text ? { type: "delta", text: delta.text } : undefined;
}

/** tool 呼び出し開始 event から browser の `tool_start` event を作る。 */
function toolStartEvent(
  event: Record<string, unknown>,
): AgentToBrowserMessage | undefined {
  const toolUse = asRecord(event.toolUse);
  const name = text(toolUse.name);
  return name ? { type: "tool_start", name } : undefined;
}

/** tool 実行結果 event から browser の `tool_end` event を作る。 */
function toolEndEvent(
  event: Record<string, unknown>,
): AgentToBrowserMessage | undefined {
  const toolUse = asRecord(event.toolUse);
  const result = asRecord(event.result);
  const name = text(toolUse.name);

  if (!name) {
    return undefined;
  }

  return {
    type: "tool_end",
    name,
    ok: result.status === "success",
  };
}

/** object 以外の値を空 record として扱い、unknown event を安全に読む。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** unknown 値を trim 済み文字列として取り出す。 */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
