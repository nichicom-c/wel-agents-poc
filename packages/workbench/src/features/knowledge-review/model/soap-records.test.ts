import { describe, expect, test } from "bun:test";

import {
  latestVersion,
  type SoapRecordVersion,
  versionsForRecord,
} from "./soap-records.ts";

const VERSIONS: SoapRecordVersion[] = [
  {
    createdAt: "2026-07-02T00:00:00.000Z",
    createdBy: "author-a",
    id: "record-1-v2",
    items: [],
    recordId: "record-1",
    source: "manual",
    versionNo: 2,
  },
  {
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: "author-a",
    id: "record-1-v1",
    items: [],
    recordId: "record-1",
    source: "soap_draft_ai",
    versionNo: 1,
  },
  {
    createdAt: "2026-07-03T00:00:00.000Z",
    createdBy: "author-b",
    id: "record-2-v1",
    items: [],
    recordId: "record-2",
    source: "voice_capture",
    versionNo: 1,
  },
];

describe("versionsForRecord", () => {
  test("指定した記録の版だけを versionNo の昇順で返す", () => {
    const result = versionsForRecord(VERSIONS, "record-1");
    expect(result.map((version) => version.versionNo)).toEqual([1, 2]);
  });

  test("該当する記録が無ければ空配列を返す", () => {
    expect(versionsForRecord(VERSIONS, "record-3")).toHaveLength(0);
  });
});

describe("latestVersion", () => {
  test("versionNo が最大の版を返す", () => {
    expect(latestVersion(VERSIONS, "record-1")?.id).toBe("record-1-v2");
  });

  test("該当する記録が無ければ undefined を返す", () => {
    expect(latestVersion(VERSIONS, "record-3")).toBeUndefined();
  });
});
