import { describe, expect, test } from "bun:test";

import { fetchMasters } from "./masters.ts";

describe("fetchMasters", () => {
  test("4種のマスタを正規化して返す", async () => {
    const fetchFn = async () =>
      Response.json({
        difficultyLevels: [{ id: "beginner", label: "初級" }],
        learningThemes: [{ id: "documentation", label: "記録表現" }],
        rejectionReasonCodes: [{ code: "other", label: "その他" }],
        specialties: [{ id: "maternal-child", label: "母子保健" }],
      });

    expect(await fetchMasters(fetchFn)).toEqual({
      difficultyLevels: [{ id: "beginner", label: "初級" }],
      learningThemes: [{ id: "documentation", label: "記録表現" }],
      rejectionReasonCodes: [{ code: "other", label: "その他" }],
      specialties: [{ id: "maternal-child", label: "母子保健" }],
    });
  });

  test("id/label が欠けた要素と配列でない項目は落とす", async () => {
    const fetchFn = async () =>
      Response.json({
        learningThemes: "not an array",
        rejectionReasonCodes: [{ code: "", label: "その他" }],
        specialties: [
          { id: "maternal-child", label: "母子保健" },
          { id: "", label: "ラベルだけ" },
          { id: "id-only" },
        ],
      });

    expect(await fetchMasters(fetchFn)).toEqual({
      difficultyLevels: [],
      learningThemes: [],
      rejectionReasonCodes: [],
      specialties: [{ id: "maternal-child", label: "母子保健" }],
    });
  });

  test("エラー応答は error 本文を添えて throw する", async () => {
    const fetchFn = async () =>
      Response.json(
        { error: "training data store is not configured" },
        {
          status: 503,
        },
      );

    expect(fetchMasters(fetchFn)).rejects.toThrow(
      "training data store is not configured",
    );
  });
});
