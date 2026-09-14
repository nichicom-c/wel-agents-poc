/**
 * `contracts/soap-gap-rules.ts` のルール設定（`SoapGapRuleConfig`）を使う際の補助ロジック。
 */

import { DEFAULT_SOAP_GAP_RULE_CONFIG } from "../contracts/soap-gap-rules.ts";

/** `{key}` 形式のプレースホルダを `vars` の値で単純置換する。 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

/**
 * 設定由来の日付パターン文字列を `RegExp` にコンパイルする。管理者が壊れた正規表現を
 * 保存しても検出処理自体は落ちないよう、失敗時は既定の日付パターンにフォールバックする。
 */
export function compileDatePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch {
    return new RegExp(DEFAULT_SOAP_GAP_RULE_CONFIG.datePattern);
  }
}
