/**
 * Training 画面の教材チャットが渡す教材の文脈。専門 tool を経由しないため、supervisor の
 * 「専門 agent に確認せず自分の知識で答えてはならない」という制約を受けない専用 agent
 * （material-chat-agent.ts）がこれを唯一の情報源として扱う。
 */
export type MaterialChatContext = {
  title: string;
  learningObjective?: string;
  teachingPoints: string[];
};

export type MaterialChatTurnRole = "user" | "assistant";

/** これまでの会話（表示用に client 側が保持している履歴）。1ターン = 1発言。 */
export type MaterialChatTurn = {
  role: MaterialChatTurnRole;
  text: string;
};
