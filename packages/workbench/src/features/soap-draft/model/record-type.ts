/**
 * SOAP 下書き候補の反映候補チェックボックスに使う記録種別。
 * 順序は issue #5 の記載（支援実績、汎用記録、会議、サマリー）に合わせる。
 *
 * 分類前にユーザーが選ぶ入力ではなく、分類後に候補ごとの反映候補として
 * LLM が推薦する（`recommendedRecordTypes`）出力側の概念。
 */
export const SOAP_RECORD_TYPES = [
  "support_activity",
  "general_record",
  "meeting",
  "summary",
] as const;

export type SoapRecordType = (typeof SOAP_RECORD_TYPES)[number];

const SOAP_RECORD_TYPE_LABELS: Record<SoapRecordType, string> = {
  support_activity: "支援実績",
  general_record: "汎用記録",
  meeting: "会議",
  summary: "サマリー",
};

export function soapRecordTypeLabel(recordType: SoapRecordType): string {
  return SOAP_RECORD_TYPE_LABELS[recordType];
}

export function isSoapRecordType(value: unknown): value is SoapRecordType {
  return (SOAP_RECORD_TYPES as readonly unknown[]).includes(value);
}
