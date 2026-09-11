/**
 * 不足確認チャット（issue #6 の拡張）のリクエスト判定・抽出。
 *
 * 「次にどの不足を扱うか」の決定はしない（呼び出し側が管理する）。ここでは payload から
 * 「今回扱う1件の不足」「文脈用の現在のSOAP候補」「利用者の今回の発言（任意）」を
 * 取り出すだけに専念する。
 */

import type { RuntimeRequest } from "../contracts/runtime.ts";
import { SOAP_CATEGORIES, type SoapCategory } from "../contracts/soap-draft.ts";
import { GAP_TYPES, type Gap, type GapType } from "../contracts/soap-gaps.ts";

export { getSoapGapsCandidates as getSoapGapsChatCandidates } from "./soap-gaps.ts";

/** payload が不足確認チャットのリクエストかどうか。 */
export function isSoapGapsChatRequest(payload: RuntimeRequest): boolean {
  return payload.type === "soap_gaps_chat";
}

function isGapType(value: unknown): value is GapType {
  return (GAP_TYPES as readonly unknown[]).includes(value);
}

function isSoapCategory(value: unknown): value is SoapCategory {
  return (SOAP_CATEGORIES as readonly unknown[]).includes(value);
}

function isGap(value: unknown): value is Gap {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isGapType(record.gapType) &&
    isSoapCategory(record.soapCategory) &&
    typeof record.targetItem === "string" &&
    record.targetItem.trim() !== "" &&
    typeof record.detail === "string" &&
    record.detail.trim() !== "" &&
    Array.isArray(record.relatedEvidenceQuotes) &&
    record.relatedEvidenceQuotes.length > 0 &&
    record.relatedEvidenceQuotes.every((quote) => typeof quote === "string") &&
    typeof record.skippable === "boolean"
  );
}

/** payload から今回扱う不足（1件）を取り出す。無効/欠落なら undefined。 */
export function getSoapGapsChatGap(payload: RuntimeRequest): Gap | undefined {
  return isGap(payload.gap) ? payload.gap : undefined;
}

/** payload から利用者の今回の発言を取り出す。初回ターン（不足の提示のみ）なら undefined。 */
export function getSoapGapsChatMessage(
  payload: RuntimeRequest,
): string | undefined {
  const { message } = payload;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : undefined;
}
