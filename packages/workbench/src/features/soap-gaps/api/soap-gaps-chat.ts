import type { SoapDraftApiCandidate } from "../../soap-draft/index.ts";
import type { GapApiItem } from "./soap-gaps.ts";

const SOAP_GAPS_CHAT_ENDPOINT = "/api/soap-gaps-chat";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type PostSoapGapsChatOptions = {
  candidates: SoapDraftApiCandidate[];
  /** `/api/soap-gaps` から得た不足のうち、今回の1ターンで扱う1件をそのまま渡す。 */
  gap: GapApiItem;
  /** 同じ不足確認チャットの継続なら、前回のレスポンスの値を渡す。省略時は新規セッション。 */
  conversationId?: string;
  /** 利用者の今回の発言。省略時は「この不足を提示してください」という初回ターン扱い。 */
  message?: string;
  fetchFn?: FetchFn;
};

export type SoapGapsChatApiResult = {
  conversationId: string;
  message: string;
  suggestions: string[];
  resolved: boolean;
  candidateText?: string;
};

/** 不足確認チャットの1ターンを BFF `/api/soap-gaps-chat` に送る。 */
export async function postSoapGapsChat({
  candidates,
  gap,
  conversationId,
  message,
  fetchFn = fetch,
}: PostSoapGapsChatOptions): Promise<SoapGapsChatApiResult> {
  const response = await fetchFn(SOAP_GAPS_CHAT_ENDPOINT, {
    body: JSON.stringify({
      candidates,
      gap,
      ...(conversationId ? { conversationId } : {}),
      ...(message ? { message } : {}),
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      trimmedText(payload.error) ||
        trimmedText(payload.message) ||
        `HTTP ${response.status}`,
    );
  }

  const resultConversationId = trimmedText(payload.conversationId);
  if (!resultConversationId) {
    throw new Error("invalid response from /api/soap-gaps-chat");
  }

  return {
    candidateText: trimmedText(payload.candidateText) || undefined,
    conversationId: resultConversationId,
    message: trimmedText(payload.message),
    resolved: payload.resolved === true,
    suggestions: Array.isArray(payload.suggestions)
      ? payload.suggestions.filter(
          (suggestion): suggestion is string =>
            typeof suggestion === "string" && suggestion.trim() !== "",
        )
      : [],
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
