import { describe, expect, test } from "bun:test";

import {
  currentVersionForRecordType,
  type SoapMappingVersion,
  versionsForRecordType,
} from "./soap-mapping.ts";

const MAPPING_DEFINITION = { A: "a", O: "o", P: "p", S: "s" };

const BASE_VERSIONS: SoapMappingVersion[] = [
  {
    createdBy: "admin-a",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    id: "mapping-1",
    isCurrent: true,
    mappingDefinition: MAPPING_DEFINITION,
    recordType: "support_activity",
    versionNo: 1,
  },
  {
    createdBy: "admin-a",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    id: "mapping-2",
    isCurrent: true,
    mappingDefinition: MAPPING_DEFINITION,
    recordType: "meeting",
    versionNo: 1,
  },
];

describe("versionsForRecordType / currentVersionForRecordType", () => {
  test("指定した記録種別の版だけを返す", () => {
    expect(
      versionsForRecordType(BASE_VERSIONS, "support_activity"),
    ).toHaveLength(1);
  });

  test("isCurrent の版を返す", () => {
    expect(
      currentVersionForRecordType(BASE_VERSIONS, "support_activity")?.id,
    ).toBe("mapping-1");
  });
});
