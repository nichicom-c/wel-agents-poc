import { z } from "zod";

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

/**
 * 教材チャット agent の structuredOutputSchema。
 *
 * 「次にどの指導のポイントを扱うか」は呼び出し側（BFF/Workbench）がキューとして決定的に管理し、
 * この agent は渡された1件のポイント（`RuntimeRequest.teaching_point`、無ければ教材全体の
 * 自由対話）を会話的に提示・深掘りするだけに専念する（`soap_gaps_chat` と同じ役割分担）。
 */
export const materialChatOutputSchema = z.object({
  message: z
    .string()
    .min(1)
    .describe("利用者にそのまま表示するチャット発言（日本語）。"),
  suggestions: z
    .array(z.string().min(1))
    .max(3)
    .describe(
      "断定しないブレインストーミング的な回答例・視点（0〜3件）。resolvedがtrueなら空配列でよい。",
    ),
  resolved: z
    .boolean()
    .describe("今回のやりとりで、この指導のポイントへの対応が完了したか。"),
});

export type MaterialChatOutput = z.infer<typeof materialChatOutputSchema>;
