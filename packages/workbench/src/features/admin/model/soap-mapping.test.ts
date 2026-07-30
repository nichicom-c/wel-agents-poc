import { describe, expect, test } from "bun:test";

import {
  createSoapMappingVersion,
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

describe("createSoapMappingVersion", () => {
  test("同じ記録種別の既存バージョンの isCurrent を落とし、新規を isCurrent にする", () => {
    const updated = createSoapMappingVersion(
      BASE_VERSIONS,
      "support_activity",
      MAPPING_DEFINITION,
      "admin-b",
    );

    const forSupportActivity = versionsForRecordType(
      updated,
      "support_activity",
    );
    expect(forSupportActivity).toHaveLength(2);
    expect(forSupportActivity[0]?.isCurrent).toBe(false);
    expect(forSupportActivity[1]?.isCurrent).toBe(true);
    expect(forSupportActivity[1]?.versionNo).toBe(2);
  });

  test("他の記録種別のバージョンには影響しない", () => {
    const updated = createSoapMappingVersion(
      BASE_VERSIONS,
      "support_activity",
      MAPPING_DEFINITION,
      "admin-b",
    );

    expect(currentVersionForRecordType(updated, "meeting")?.id).toBe(
      "mapping-2",
    );
  });

  test("既存バージョンが無い記録種別では version 1 から始まる", () => {
    const updated = createSoapMappingVersion(
      BASE_VERSIONS,
      "summary",
      MAPPING_DEFINITION,
      "admin-b",
    );

    expect(currentVersionForRecordType(updated, "summary")?.versionNo).toBe(1);
  });
});
