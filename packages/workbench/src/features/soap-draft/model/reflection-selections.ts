import { SOAP_RECORD_TYPES, type SoapRecordType } from "./record-type.ts";

/**
 * 「反映候補」チェックボックスの選択状態。個々の S/O/A/P 候補ごとではなく、
 * 分類結果全体（今回の解析 1 回分）に対して 1 組だけ持つ。
 */
export type ReflectionSelections = Record<SoapRecordType, boolean>;

/** LLM が推薦した記録種別（`recommendedRecordTypes`）を初期状態として組み立てる。 */
export function buildReflectionSelections(
  recommended: SoapRecordType[],
): ReflectionSelections {
  const recommendedSet = new Set(recommended);
  return Object.fromEntries(
    SOAP_RECORD_TYPES.map((type) => [type, recommendedSet.has(type)]),
  ) as ReflectionSelections;
}

/** 指定した記録種別のチェックだけを反転した新しい selections を返す。 */
export function toggleReflectionSelection(
  selections: ReflectionSelections,
  recordType: SoapRecordType,
): ReflectionSelections {
  return { ...selections, [recordType]: !selections[recordType] };
}
