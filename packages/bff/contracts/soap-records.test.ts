import { describe, expect, test } from "bun:test";

import {
  isSoapCategory,
  isSoapRecordType,
  isSoapRecordVersionSource,
} from "./soap-records.ts";

describe("isSoapRecordType", () => {
  test("既知の記録種別を受け入れる", () => {
    expect(isSoapRecordType("support_activity")).toBe(true);
    expect(isSoapRecordType("summary")).toBe(true);
  });

  test("未知の値・非文字列は拒否する", () => {
    expect(isSoapRecordType("unknown")).toBe(false);
    expect(isSoapRecordType(undefined)).toBe(false);
    expect(isSoapRecordType(1)).toBe(false);
  });
});

describe("isSoapCategory", () => {
  test("S/O/A/P/UNCLASSIFIED を受け入れる", () => {
    for (const category of ["S", "O", "A", "P", "UNCLASSIFIED"]) {
      expect(isSoapCategory(category)).toBe(true);
    }
  });

  test("未知の値は拒否する", () => {
    expect(isSoapCategory("X")).toBe(false);
  });
});

describe("isSoapRecordVersionSource", () => {
  test("soap_draft_ai/voice_capture/manual を受け入れる", () => {
    expect(isSoapRecordVersionSource("soap_draft_ai")).toBe(true);
    expect(isSoapRecordVersionSource("voice_capture")).toBe(true);
    expect(isSoapRecordVersionSource("manual")).toBe(true);
  });

  test("未知の値は拒否する", () => {
    expect(isSoapRecordVersionSource("ai")).toBe(false);
  });
});
