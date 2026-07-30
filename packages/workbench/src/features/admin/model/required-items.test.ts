import { describe, expect, test } from "bun:test";

import {
  createRequiredItem,
  filterRequiredItems,
  type RequiredRecommendedItem,
} from "./required-items.ts";

const BASE_ITEMS: RequiredRecommendedItem[] = [
  {
    aggregationCategory: "基本情報",
    id: "item-1",
    itemName: "訪問日時",
    recordType: "support_activity",
    requirementLevel: "required",
  },
  {
    aggregationCategory: "リスク評価",
    id: "item-2",
    itemName: "パートナー等の育児参加状況",
    recordType: "support_activity",
    requirementLevel: "recommended",
    specialtyId: "maternal-child",
  },
  {
    aggregationCategory: "基本情報",
    id: "item-3",
    itemName: "出席者",
    recordType: "meeting",
    requirementLevel: "required",
  },
];

describe("filterRequiredItems", () => {
  test("フィルタ無しでは全件を返す", () => {
    expect(filterRequiredItems(BASE_ITEMS, {})).toHaveLength(3);
  });

  test("recordType で絞り込める", () => {
    expect(
      filterRequiredItems(BASE_ITEMS, { recordType: "meeting" }),
    ).toHaveLength(1);
  });

  test("specialtyId で絞り込める（全分野共通項目は specialtyId 未指定時のみ対象外になる）", () => {
    const result = filterRequiredItems(BASE_ITEMS, {
      specialtyId: "maternal-child",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("item-2");
  });
});

describe("createRequiredItem", () => {
  test("新規項目を末尾に追加する", () => {
    const updated = createRequiredItem(BASE_ITEMS, {
      aggregationCategory: "支援計画",
      itemName: "次回確認事項",
      recordType: "support_activity",
      requirementLevel: "required",
    });

    expect(updated).toHaveLength(4);
    expect(updated[updated.length - 1]?.itemName).toBe("次回確認事項");
  });
});
