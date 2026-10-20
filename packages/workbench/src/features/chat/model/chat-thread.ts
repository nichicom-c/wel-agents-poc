/**
 * 教材チャットのメッセージ履歴(session-local な UI 状態)。
 * 会話文脈そのものは client（この state）が保持し、毎回 BFF へ送り直す（AgentCore Memory は
 * 使わない）。`features/soap-gaps/model/chat-thread.ts` と同型だが、suggestions の役割は異なる:
 * 不足確認チャットのそれは入力欄に流し込む回答例であるのに対し、こちらは答えを明かさずに
 * 考える切り口を示すヒントで、読むだけのもの（クリックして送信させない）。
 */
export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  text: string;
  /** assistant メッセージにのみ付く、答えを明かさずに考える切り口を示すヒント（0〜3件）。 */
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

/** 直近の assistant メッセージが持つヒント（無ければ空配列）。 */
export function latestAssistantSuggestions(messages: ChatMessage[]): string[] {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return lastAssistant?.suggestions ?? [];
}
