/**
 * BFF `/api/material-chat` を呼ぶ教材チャットの client。専門 tool（RAG）を経由しない
 * 専用 agent（`material_chat_agent`）を呼び、教材の内容そのものを唯一の情報源として
 * 自由に対話する。AgentCore Memory を使わない stateless 設計のため、client（この関数の
 * 呼び出し元）がこれまでの会話履歴をそのまま保持し、毎回 `history` として送り直す。
 */

const MATERIAL_CHAT_ENDPOINT = "/api/material-chat";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type MaterialChatMaterial = {
  title: string;
  learningObjective?: string;
  teachingPoints?: string[];
};

export type MaterialChatTurnRole = "user" | "assistant";

export type MaterialChatTurn = {
  role: MaterialChatTurnRole;
  text: string;
};

export type PostMaterialChatInput = {
  material: MaterialChatMaterial;
  /** これまでの会話（初回ターンは空配列）。 */
  history: MaterialChatTurn[];
  /** 今回のトレーニーの発言（初回ターンは省略）。 */
  message?: string;
};

export async function postMaterialChat(
  input: PostMaterialChatInput,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const response = await fetchFn(MATERIAL_CHAT_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const message = trimmedText(payload.message);
  if (!message) {
    throw new Error("invalid response from /api/material-chat");
  }
  return message;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}));
  return asRecord(payload);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
