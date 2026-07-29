import { describe, expect, test } from "bun:test";

import {
  GAP_TYPES,
  gapTypeLabel,
  groupByGapType,
  isGapType,
} from "./gap-type.ts";

describe("gapTypeLabel", () => {
  test("すべての不足種別に日本語ラベルを持つ", () => {
    for (const gapType of GAP_TYPES) {
      expect(gapTypeLabel(gapType)).toEqual(expect.any(String));
      expect(gapTypeLabel(gapType).length).toBeGreaterThan(0);
    }
  });

  test("既知のマッピングを返す", () => {
    expect(gapTypeLabel("missing_required")).toBe("必須不足");
    expect(gapTypeLabel("insufficient_reasoning")).toBe("根拠不足");
    expect(gapTypeLabel("contradictory")).toBe("矛盾");
    expect(gapTypeLabel("ambiguous")).toBe("曖昧");
    expect(gapTypeLabel("missing_recommended")).toBe("推奨不足");
    expect(gapTypeLabel("review_recommended")).toBe("確認推奨");
  });
});

describe("isGapType", () => {
  test("既知の不足種別だけ true を返す", () => {
    for (const gapType of GAP_TYPES) {
      expect(isGapType(gapType)).toBe(true);
    }
    expect(isGapType("unknown_type")).toBe(false);
    expect(isGapType(123)).toBe(false);
  });
});

describe("groupByGapType", () => {
  test("GAP_TYPES の優先順序でまとめ、該当が無い種別は含めない", () => {
    const items = [
      { gapType: "ambiguous" as const, id: "1" },
      { gapType: "missing_required" as const, id: "2" },
      { gapType: "missing_required" as const, id: "3" },
    ];
    const groups = groupByGapType(items);

    expect(groups.map((g) => g.gapType)).toEqual([
      "missing_required",
      "ambiguous",
    ]);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[1]?.items).toHaveLength(1);
  });
});
