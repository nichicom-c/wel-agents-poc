import { describe, expect, test } from "bun:test";

import { rejectionReasonLabel, tagLabel } from "./masters.ts";

const SPECIALTIES = [{ id: "maternal-child", label: "母子保健" }];
const REJECTION_REASON_CODES = [{ code: "other", label: "その他" }];

describe("tagLabel", () => {
  test("マスタにある id はラベルに置き換える", () => {
    expect(tagLabel(SPECIALTIES, "maternal-child")).toBe("母子保健");
  });

  test("マスタに無い id はそのまま返す", () => {
    expect(tagLabel(SPECIALTIES, "unknown-id")).toBe("unknown-id");
  });

  test("マスタ未取得（空配列）でも id をそのまま返す", () => {
    expect(tagLabel([], "maternal-child")).toBe("maternal-child");
  });
});

describe("rejectionReasonLabel", () => {
  test("マスタにある code はラベルに置き換える", () => {
    expect(rejectionReasonLabel(REJECTION_REASON_CODES, "other")).toBe(
      "その他",
    );
  });

  test("マスタに無い code はそのまま返す", () => {
    expect(rejectionReasonLabel(REJECTION_REASON_CODES, "unknown")).toBe(
      "unknown",
    );
  });
});
