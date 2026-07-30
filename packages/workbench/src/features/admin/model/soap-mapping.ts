import type { SoapCategory, SoapRecordType } from "../../soap-draft/index.ts";
import { createId } from "./create-id.ts";

/** マッピング定義の対象は UNCLASSIFIED を除く S/O/A/P の4カテゴリに限る。 */
export const MAPPING_CATEGORIES = [
  "S",
  "O",
  "A",
  "P",
] as const satisfies readonly SoapCategory[];

export type MappingCategory = (typeof MAPPING_CATEGORIES)[number];

export type MappingDefinition = Record<MappingCategory, string>;

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

/**
 * 新規バージョンを作り、同じ記録種別の既存バージョンの `isCurrent` を落とす。既存の
 * `soap_record_versions`（正式記録の版）は生成時点のバージョン id を持つ想定のため、ここで
 * 過去の版を書き換えることはしない（issue #10「変更は既存記録へ即時反映せず、新規解析から
 * 適用する」）。
 */
export function createSoapMappingVersion(
  versions: readonly SoapMappingVersion[],
  recordType: SoapRecordType,
  mappingDefinition: MappingDefinition,
  createdBy: string,
): SoapMappingVersion[] {
  const existing = versionsForRecordType(versions, recordType);
  const nextVersionNo = (existing[existing.length - 1]?.versionNo ?? 0) + 1;
  const created: SoapMappingVersion = {
    createdBy,
    effectiveFrom: new Date().toISOString(),
    id: createId("mapping"),
    isCurrent: true,
    mappingDefinition,
    recordType,
    versionNo: nextVersionNo,
  };
  return [
    ...versions.map((version) =>
      version.recordType === recordType
        ? { ...version, isCurrent: false }
        : version,
    ),
    created,
  ];
}
