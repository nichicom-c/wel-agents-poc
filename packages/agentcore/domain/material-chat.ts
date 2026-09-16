import type {
  MaterialChatContext,
  MaterialChatTurn,
  MaterialChatTurnRole,
} from "../contracts/material-chat.ts";
import type { RuntimeRequest } from "../contracts/runtime.ts";

/** payload が教材チャットリクエストかどうか。それ以外（省略含む）は chat として扱う。 */
export function isMaterialChatRequest(payload: RuntimeRequest): boolean {
  return payload.type === "material_chat";
}

/** payload から教材の文脈を取り出す。`title` が無ければ undefined。 */
export function getMaterialChatContext(
  payload: RuntimeRequest,
): MaterialChatContext | undefined {
  const record = asRecord(payload.material);
  const title = textField(record.title);
  if (!title) {
    return undefined;
  }

  return {
    learningObjective: textField(record.learningObjective) || undefined,
    teachingPoints: stringArray(record.teachingPoints),
    title,
  };
}

/** payload からこれまでの会話履歴を取り出す。無効な要素は無視する。 */
export function getMaterialChatHistory(
  payload: RuntimeRequest,
): MaterialChatTurn[] {
  const { history } = payload;
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .map((entry): MaterialChatTurn | undefined => {
      const record = asRecord(entry);
      const role = record.role;
      const text = textField(record.text);
      if (!isTurnRole(role) || !text) {
        return undefined;
      }
      return { role, text };
    })
    .filter((turn): turn is MaterialChatTurn => turn !== undefined);
}

/** payload から今回のトレーニーの発言を取り出す。初回ターン（省略）は undefined。 */
export function getMaterialChatMessage(
  payload: RuntimeRequest,
): string | undefined {
  const { message } = payload;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : undefined;
}

/**
 * payload から「今回扱う1件の指導のポイント」を取り出す。呼び出し側（BFF/Workbench）が
 * `material.teachingPoints` からキューとして選ぶ。省略時はポイントを絞らない教材全体の
 * 自由対話として扱う。
 */
export function getMaterialChatTeachingPoint(
  payload: RuntimeRequest,
): string | undefined {
  const { teaching_point: teachingPoint } = payload;
  return typeof teachingPoint === "string" && teachingPoint.trim()
    ? teachingPoint.trim()
    : undefined;
}

function isTurnRole(value: unknown): value is MaterialChatTurnRole {
  return value === "user" || value === "assistant";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => textField(entry))
    .filter((entry) => entry.length > 0);
}
