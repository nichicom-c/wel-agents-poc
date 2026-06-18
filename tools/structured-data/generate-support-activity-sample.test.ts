import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertSyntheticDataset,
  csvForTable,
  EXPECTED_COUNTS,
  makeSupportActivitySample,
  TABLE_NAMES,
  verifyWrittenSample,
  writeSupportActivitySample,
} from "./generate-support-activity-sample.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

async function tempOutputRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "support-activity-sample-"));
  tempDirs.push(dir);
  return dir;
}

describe("makeSupportActivitySample", () => {
  test("deterministic synthetic table counts and stable IDs", () => {
    const first = makeSupportActivitySample();
    const second = makeSupportActivitySample();

    expect(first).toEqual(second);
    expect(first.resident_basic_ledger).toHaveLength(EXPECTED_COUNTS.residents);
    expect(first.households).toHaveLength(EXPECTED_COUNTS.households);
    expect(first.support_cases).toHaveLength(EXPECTED_COUNTS.cases);
    expect(first.support_activity_logs).toHaveLength(
      EXPECTED_COUNTS.activityLogs,
    );
    expect(first.resident_basic_ledger[0]?.resident_id).toBe("res-0001");
    expect(first.households[0]?.household_id).toBe("hh-001");
    expect(first.support_cases[0]?.case_id).toBe("case-0001");
    expect(first.support_activity_logs[0]?.activity_id).toBe("act-0001");
  });

  test("contains no real-person style columns or free-text support notes", () => {
    const serialized = JSON.stringify(
      makeSupportActivitySample(),
    ).toLowerCase();

    for (const forbidden of [
      "name",
      "address",
      "phone_number",
      "telephone",
      "my_number",
      "individual_number",
      "note",
      "memo",
      "wel-mother",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("assertSyntheticDataset", () => {
  test("passes generated data and rejects broken foreign keys", () => {
    const dataset = makeSupportActivitySample();
    expect(() => assertSyntheticDataset(dataset)).not.toThrow();

    const firstCase = dataset.support_cases[0];
    if (!firstCase) {
      throw new Error("fixture support case is missing");
    }
    dataset.support_cases[0] = {
      ...firstCase,
      resident_id: "res-missing",
    };
    expect(() => assertSyntheticDataset(dataset)).toThrow(/resident_id/);
  });
});

describe("csvForTable", () => {
  test("writes a header and all rows for every table", () => {
    const dataset = makeSupportActivitySample();

    for (const tableName of TABLE_NAMES) {
      const csv = csvForTable(tableName, dataset[tableName]);
      const lines = csv.trimEnd().split("\n");
      expect(lines).toHaveLength(dataset[tableName].length + 1);
      expect(lines[0]).toContain("_id");
    }
  });
});

describe("writeSupportActivitySample", () => {
  test("writes CSV mirror and Parquet files with matching row counts", async () => {
    const outputRoot = await tempOutputRoot();
    const result = await writeSupportActivitySample({ outputRoot });
    const verification = await verifyWrittenSample(outputRoot);

    expect(result.tables).toEqual(TABLE_NAMES);
    expect(verification).toEqual({
      resident_basic_ledger: EXPECTED_COUNTS.residents,
      households: EXPECTED_COUNTS.households,
      support_cases: EXPECTED_COUNTS.cases,
      support_activity_logs: EXPECTED_COUNTS.activityLogs,
    });
  });
});
