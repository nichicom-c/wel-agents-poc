import type { RuntimeRequest } from "../contracts/runtime.ts";

/** payload に session/actor が無いときの既定値（単発の動作確認用）。 */
export const DEFAULT_ACTOR_ID = "wel-agents-user";
export const DEFAULT_SESSION_ID = "wel-agents-session";

/** payload から有効な prompt（非空文字列）を取り出す。無ければ undefined。 */
export function getPrompt(payload: RuntimeRequest): string | undefined {
  const { prompt } = payload;
  return typeof prompt === "string" && prompt.trim()
    ? prompt.trim()
    : undefined;
}

/** 会話の actor（利用者）識別子。Memory の actor 単位の分離に使う。 */
export function getActorId(payload: RuntimeRequest): string {
  return strField(payload.actor_id, DEFAULT_ACTOR_ID);
}

/** 会話の session 識別子。Memory の session 単位の履歴に使う。 */
export function getSessionId(payload: RuntimeRequest): string {
  return strField(payload.session_id, DEFAULT_SESSION_ID);
}

/** AgentCore Runtime session ID の制約に合う値か検証する。 */
export function isRuntimeSessionId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{32,255}$/.test(value);
}

/** 履歴があれば前置きした supervisor 入力メッセージを組み立てる。 */
export function composeMessage(prompt: string, history: string): string {
  return history
    ? `Previous conversation:\n${history}\n\nUser question: ${prompt}`
    : prompt;
}

function strField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
