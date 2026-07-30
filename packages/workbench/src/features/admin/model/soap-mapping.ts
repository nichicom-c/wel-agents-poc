import type { SoapCategory, SoapRecordType } from "../../soap-draft/index.ts";

/** マッピング定義の対象は UNCLASSIFIED を除く S/O/A/P の4カテゴリに限る。 */
export const MAPPING_CATEGORIES = [
  "S",
  "O",
  "A",
  "P",
] as const satisfies readonly SoapCategory[];

export type MappingCategory = (typeof MAPPING_CATEGORIES)[number];

export type MappingDefinition = Record<MappingCategory, string>;

/**
 * SOAP マッピングの1バージョン。BFF `/api/soap-mapping-versions`
 * （Aurora Serverless v2 + RDS Data API）から取得する。
 */
export type SoapMappingVersion = {
  id: string;
  recordType: SoapRecordType;
  versionNo: number;
  mappingDefinition: MappingDefinition;
  isCurrent: boolean;
  effectiveFrom: string;
  createdBy: string;
};

export function versionsForRecordType(
  versions: readonly SoapMappingVersion[],
  recordType: SoapRecordType,
): SoapMappingVersion[] {
  return versions
    .filter((version) => version.recordType === recordType)
    .toSorted((a, b) => a.versionNo - b.versionNo);
}

export function currentVersionForRecordType(
  versions: readonly SoapMappingVersion[],
  recordType: SoapRecordType,
): SoapMappingVersion | undefined {
  return versionsForRecordType(versions, recordType).find(
    (version) => version.isCurrent,
  );
}
