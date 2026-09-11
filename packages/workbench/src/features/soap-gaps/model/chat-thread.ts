/**
 * 不足確認チャットのメッセージ履歴（session-local な UI 状態）。
 * 会話文脈そのものは AgentCore Memory 側が持つため、ここでは表示用の履歴だけを保持する。
 */
export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  text: string;
  /** assistant メッセージにのみ付く、ブレインストーミング的な言い回し候補（0〜3件）。 */
  suggestions?: string[];
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
  suggestions: string[] = [],
): ChatMessage[] {
  return [
    ...messages,
    {
      id: createId(),
      role: "assistant",
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      text,
    },
  ];
}

/** 直近の assistant メッセージが持つ言い回し候補（無ければ空配列）。 */
export function latestAssistantSuggestions(messages: ChatMessage[]): string[] {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return lastAssistant?.suggestions ?? [];
}
