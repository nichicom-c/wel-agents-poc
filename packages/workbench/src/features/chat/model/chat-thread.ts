/**
 * 汎用チャットのメッセージ履歴(session-local な UI 状態)。
 * 会話文脈そのものは AgentCore Memory 側が持つため、ここでは表示用の履歴だけを保持する。
 * `features/soap-gaps/model/chat-thread.ts` と同型だが、suggestions のような
 * 不足確認チャット固有の概念は持たない。
 */
export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  text: string;
};

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function appendUserMessage(
  messages: ChatMessage[],
  text: string,
): ChatMessage[] {
  return [...messages, { id: createId(), role: "user", text }];
}

export function appendAssistantMessage(
  messages: ChatMessage[],
  text: string,
): ChatMessage[] {
  return [...messages, { id: createId(), role: "assistant", text }];
}
