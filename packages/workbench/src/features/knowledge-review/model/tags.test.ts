import { describe, expect, test } from "bun:test";

import { SPECIALTIES, tagLabel } from "./tags.ts";

describe("tagLabel", () => {
  test("id に対応する label を返す", () => {
    expect(tagLabel(SPECIALTIES, "maternal-child")).toBe("母子保健");
  });

  test("該当する id が無ければ id をそのまま返す", () => {
    expect(tagLabel(SPECIALTIES, "unknown-id")).toBe("unknown-id");
  });
});
