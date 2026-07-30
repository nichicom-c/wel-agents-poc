/**
 * SOAP Studio の「正式記録として保存」（issue #8 の前提。
 * `docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）が使う
 * `POST /api/soap-records` / `GET /api/soap-records` / `GET /api/soap-records/{recordId}/versions`
 * の contract。DB スキーマは `terraform/aws/bff/migrations/0001_init.sql` の
 * `soap_records` / `soap_record_versions` に対応する。
 */

export const SOAP_RECORD_TYPES = [
  "support_activity",
  "general_record",
  "meeting",
  "summary",
] as const;

export type SoapRecordType = (typeof SOAP_RECORD_TYPES)[number];

export function isSoapRecordType(value: unknown): value is SoapRecordType {
  return (
    typeof value === "string" &&
    (SOAP_RECORD_TYPES as readonly string[]).includes(value)
  );
}

export const SOAP_CATEGORIES = ["S", "O", "A", "P", "UNCLASSIFIED"] as const;

export type SoapCategory = (typeof SOAP_CATEGORIES)[number];

export function isSoapCategory(value: unknown): value is SoapCategory {
  return (
    typeof value === "string" &&
    (SOAP_CATEGORIES as readonly string[]).includes(value)
  );
}

export const SOAP_RECORD_VERSION_SOURCES = [
  "soap_draft_ai",
  "voice_capture",
  "manual",
] as const;

export type SoapRecordVersionSource =
  (typeof SOAP_RECORD_VERSION_SOURCES)[number];

export function isSoapRecordVersionSource(
  value: unknown,
): value is SoapRecordVersionSource {
  return (
    typeof value === "string" &&
    (SOAP_RECORD_VERSION_SOURCES as readonly string[]).includes(value)
  );
}

export type SoapRecordItem = {
  category: SoapCategory;
  text: string;
};

export type SoapRecordSummary = {
  id: string;
  recordType: SoapRecordType;
  status: "draft" | "finalized";
  createdBy: string;
  createdAt: string;
};

export type SoapRecordVersion = {
  id: string;
  recordId: string;
  versionNo: number;
  items: SoapRecordItem[];
  source: SoapRecordVersionSource;
  createdBy: string;
  createdAt: string;
};

export type CreateSoapRecordVersionResult = {
  recordId: string;
  versionId: string;
  versionNo: number;
};
