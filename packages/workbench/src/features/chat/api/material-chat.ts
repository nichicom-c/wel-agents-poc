/**
 * BFF `/api/material-chat` を呼ぶ教材チャットの client。専門 tool（RAG）を経由しない
 * 専用 agent（`material_chat_agent`）を呼び、教材の内容そのものを唯一の情報源として
 * 段階式ガイド形式で対話する。「次にどの指導のポイントを扱うか」は呼び出し側（この関数の
 * 呼び出し元）がキューとして管理し、`teachingPoint` として1件ずつ渡す（`soap_gaps_chat` と
 * 同じ役割分担）。AgentCore Memory を使わない stateless 設計のため、これまでの会話履歴も
 * そのまま保持して毎回 `history` として送り直す。
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
  /** 今回扱う1件の指導のポイント（`material.teachingPoints` の1要素）。省略時は教材全体の自由対話。 */
  teachingPoint?: string;
  /** 今回のトレーニーの発言（このポイントの最初のターンは省略）。 */
  message?: string;
};

export type PostMaterialChatResult = {
  message: string;
  /** 断定しないブレインストーミング的な回答例・視点（0〜3件）。 */
  suggestions: string[];
  /** 今回のやりとりでこの指導のポイントへの対応が完了したか。 */
  resolved: boolean;
};

export async function postMaterialChat(
  input: PostMaterialChatInput,
  fetchFn: FetchFn = fetch,
): Promise<PostMaterialChatResult> {
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
  return {
    message,
    resolved: payload.resolved === true,
    suggestions: stringArray(payload.suggestions),
  };
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => trimmedText(entry))
    .filter((entry) => entry.length > 0);
}
