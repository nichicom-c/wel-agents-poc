import { createHash, randomUUID } from "node:crypto";

const MAX_RUNTIME_SESSION_ID_LENGTH = 256;

/** Chat UI が conversationId を渡さないときの session ID を生成する。 */
export function createConversationId(): string {
  return `chat-${randomUUID()}`;
}

/** AgentCore Runtime session ID の制約に合う conversationId か検証する。 */
export function isRuntimeSessionId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{32,255}$/.test(value);
}

/** unknown 値から trim 済みの非空候補文字列を取り出す。 */
export function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** JWT user ID と browser conversation ID から user-scoped runtime session ID を作る。 */
export function deriveRuntimeSessionId(
  userId: string,
  conversationId: string,
): string {
  if (!isRuntimeSessionId(conversationId)) {
    throw new Error("conversationId is invalid");
  }

  const prefix = runtimeSessionPrefixForUser(userId);
  const maxConversationLength = MAX_RUNTIME_SESSION_ID_LENGTH - prefix.length;
  return `${prefix}${conversationId.slice(0, maxConversationLength)}`;
}

/** JWT user ID に対応する AgentCore Runtime session ID prefix を返す。 */
export function runtimeSessionPrefixForUser(userId: string): string {
  return `u${hashUserId(userId)}-`;
}

/** user-scoped Runtime session ID から browser conversation ID を復元する。 */
export function conversationIdFromRuntimeSessionId(
  userId: string,
  runtimeSessionId: string,
): string | undefined {
  const prefix = runtimeSessionPrefixForUser(userId);
  if (!runtimeSessionId.startsWith(prefix)) {
    return undefined;
  }

  const conversationId = runtimeSessionId.slice(prefix.length);
  return isRuntimeSessionId(conversationId) ? conversationId : undefined;
}

function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("base64url").slice(0, 12);
}
