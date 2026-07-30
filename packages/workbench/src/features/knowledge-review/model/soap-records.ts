import type { SoapCategory, SoapRecordType } from "../../soap-draft/index.ts";

/**
 * SOAP Studio（issue #5/#6）は session-local で終わり、正式記録・編集履歴の永続化がまだ
 * 存在しない。issue #8 のコメントは記録・記録版を対象にする必要があるため、Knowledge Review を
 * dummy データで先行実装する間はここに固定の記録・版データを持つ。実装順序はメモ
 * `docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` の「前提整備」を参照。
 */
export type SoapRecordStatus = "draft" | "finalized";

export type SoapRecordSummary = {
  id: string;
  recordType: SoapRecordType;
  status: SoapRecordStatus;
  createdBy: string;
  createdAt: string;
};

export type SoapRecordVersionItem = {
  category: SoapCategory;
  text: string;
};

export type SoapRecordVersionSource =
  | "soap_draft_ai"
  | "voice_capture"
  | "manual";

export type SoapRecordVersion = {
  id: string;
  recordId: string;
  versionNo: number;
  items: SoapRecordVersionItem[];
  source: SoapRecordVersionSource;
  createdBy: string;
  createdAt: string;
};

/** 記録の版を版番号の昇順で返す（編集履歴として古い版から並べる）。 */
export function versionsForRecord(
  versions: readonly SoapRecordVersion[],
  recordId: string,
): SoapRecordVersion[] {
  return versions
    .filter((version) => version.recordId === recordId)
    .toSorted((a, b) => a.versionNo - b.versionNo);
}

export function latestVersion(
  versions: readonly SoapRecordVersion[],
  recordId: string,
): SoapRecordVersion | undefined {
  const forRecord = versionsForRecord(versions, recordId);
  return forRecord[forRecord.length - 1];
}
