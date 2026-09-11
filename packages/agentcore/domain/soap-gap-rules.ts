/**
 * `contracts/soap-gap-rules.ts` のルール設定を payload から取り出す・使う際の補助ロジック。
 * AgentCore は DB を直接持たないため、BFF が `knowledge_item`（`DOMAIN_RULE` カテゴリ）から
 * 読み出して payload の `gap_rule_config` に埋め込んだ値をここで解釈するだけに専念する
 * （`domain/knowledge-context.ts` と同じ best-effort な思想: 無い/壊れていれば既定値）。
 */

import type { RuntimeRequest } from "../contracts/runtime.ts";
import {
  DEFAULT_SOAP_GAP_RULE_CONFIG,
  type SoapGapRuleConfig,
  soapGapRuleConfigSchema,
} from "../contracts/soap-gap-rules.ts";

/** payload からルール設定を取り出す。未指定または不正なら既定値にフォールバックする。 */
export function getGapRuleConfig(payload: RuntimeRequest): SoapGapRuleConfig {
  const { gap_rule_config: gapRuleConfig } = payload;
  if (gapRuleConfig === undefined) {
    return DEFAULT_SOAP_GAP_RULE_CONFIG;
  }
  const result = soapGapRuleConfigSchema.safeParse(gapRuleConfig);
  return result.success ? result.data : DEFAULT_SOAP_GAP_RULE_CONFIG;
}

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
