/**
 * 教材チャットのメッセージ履歴(session-local な UI 状態)。
 * 会話文脈そのものは client（この state）が保持し、毎回 BFF へ送り直す（AgentCore Memory は
 * 使わない）。`features/soap-gaps/model/chat-thread.ts` と同型（suggestions も同じ役割）。
 */
export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  text: string;
  /** assistant メッセージにのみ付く、ブレインストーミング的な回答例・視点（0〜3件）。 */
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

/** 直近の assistant メッセージが持つ回答例・視点（無ければ空配列）。 */
export function latestAssistantSuggestions(messages: ChatMessage[]): string[] {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return lastAssistant?.suggestions ?? [];
}
