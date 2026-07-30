import { describe, expect, test } from "bun:test";

import {
  addMaterial,
  addRequiredItem,
  addRubric,
  addSoapMappingVersion,
  changeMaterialStatus,
  listMaterials,
  listQualityMetrics,
  listReferenceKnowledge,
  listRequiredItems,
  listRubrics,
  listSoapMappingVersions,
  setRubricStatus,
} from "./admin.ts";

const SAMPLE_MATERIAL = {
  createdAt: "2026-07-20T09:00:00.000Z",
  createdBy: "11111111-1111-1111-1111-111111111111",
  difficultyId: "beginner",
  id: "material-1",
  learningThemeId: "documentation",
  materialType: "comment_derived_note",
  publicationStatus: "draft",
  revisions: [
    {
      changedAt: "2026-07-20T09:00:00.000Z",
      changedBy: "11111111-1111-1111-1111-111111111111",
      fromStatus: null,
      toStatus: "draft",
    },
  ],
  specialtyId: "elderly-care",
  title: "title text",
};

const SAMPLE_RUBRIC = {
  createdAt: "2026-07-18T09:00:00.000Z",
  createdBy: "11111111-1111-1111-1111-111111111111",
  id: "rubric-1",
  items: [{ criterionName: "根拠の明確さ", description: "desc", id: "item-1" }],
  name: "name text",
  reviewStatus: "expert_review_required",
  targetType: "exercise_feedback",
  versionNo: 1,
};

describe("listMaterials", () => {
  test("filters を query string に組み立てて BFF /api/materials を呼ぶ", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({ materials: [SAMPLE_MATERIAL] });
    };

    const result = await listMaterials(
      { materialType: "comment_derived_note", publicationStatus: "draft" },
      fetchFn,
    );

    expect(requestedUrl).toBe(
      "/api/materials?materialType=comment_derived_note&publicationStatus=draft",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.revisions).toHaveLength(1);
  });

  test("response.ok が false ならエラーを投げる", async () => {
    const fetchFn = async () =>
      Response.json({ error: "authentication required" }, { status: 401 });

    await expect(listMaterials({}, fetchFn)).rejects.toThrow(
      "authentication required",
    );
  });
});

describe("changeMaterialStatus", () => {
  test("id を path に、status を body に含めて PATCH する", async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetchFn = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedUrl = input;
      requestedInit = init;
      return Response.json({
        ...SAMPLE_MATERIAL,
        publicationStatus: "reviewing",
      });
    };

    const result = await changeMaterialStatus(
      "material-1",
      "reviewing",
      fetchFn,
    );

    expect(requestedUrl).toBe("/api/materials/material-1/status");
    expect(requestedInit?.method).toBe("PATCH");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      status: "reviewing",
    });
    expect(result.publicationStatus).toBe("reviewing");
  });
});

describe("addMaterial", () => {
  test("body を JSON で POST し、作成された教材を返す", async () => {
    const fetchFn = async () => Response.json(SAMPLE_MATERIAL);

    const result = await addMaterial(
      { materialType: "comment_derived_note", title: "title text" },
      fetchFn,
    );

    expect(result.id).toBe("material-1");
  });
});

describe("listRubrics", () => {
  test("BFF /api/rubrics を呼び、items を含めて返す", async () => {
    const fetchFn = async () => Response.json({ rubrics: [SAMPLE_RUBRIC] });

    const result = await listRubrics(fetchFn);

    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(1);
  });
});

describe("setRubricStatus", () => {
  test("id を path に、reviewStatus を body に含めて PATCH する", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({ ...SAMPLE_RUBRIC, reviewStatus: "confirmed" });
    };

    const result = await setRubricStatus("rubric-1", "confirmed", fetchFn);

    expect(requestedUrl).toBe("/api/rubrics/rubric-1/review-status");
    expect(result.reviewStatus).toBe("confirmed");
  });
});

describe("addRubric", () => {
  test("body を JSON で POST し、作成されたルーブリックを返す", async () => {
    const fetchFn = async () => Response.json(SAMPLE_RUBRIC);

    const result = await addRubric(
      { name: "name text", targetType: "exercise_feedback" },
      fetchFn,
    );

    expect(result.id).toBe("rubric-1");
  });
});

describe("listReferenceKnowledge", () => {
  test("linkedMaterialIds / linkedRubricIds を含めて返す", async () => {
    const fetchFn = async () =>
      Response.json({
        referenceKnowledge: [
          {
            id: "rk-1",
            linkedMaterialIds: ["material-1"],
            linkedRubricIds: [],
            sourceType: "law",
            summary: "summary text",
            title: "title text",
          },
        ],
      });

    const result = await listReferenceKnowledge(fetchFn);

    expect(result).toEqual([
      {
        externalKbRef: undefined,
        id: "rk-1",
        linkedMaterialIds: ["material-1"],
        linkedRubricIds: [],
        sourceType: "law",
        summary: "summary text",
        title: "title text",
      },
    ]);
  });
});

describe("listSoapMappingVersions", () => {
  test("recordType を query に含めて BFF /api/soap-mapping-versions を呼ぶ", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({
        versions: [
          {
            createdBy: "11111111-1111-1111-1111-111111111111",
            effectiveFrom: "2026-07-15T00:00:00.000Z",
            id: "mapping-1",
            isCurrent: true,
            mappingDefinition: { A: "a", O: "o", P: "p", S: "s" },
            recordType: "support_activity",
            versionNo: 1,
          },
        ],
      });
    };

    const result = await listSoapMappingVersions("support_activity", fetchFn);

    expect(requestedUrl).toBe(
      "/api/soap-mapping-versions?recordType=support_activity",
    );
    expect(result).toHaveLength(1);
  });
});

describe("addSoapMappingVersion", () => {
  test("body を JSON で POST し、更新後の一覧を返す", async () => {
    let requestedInit: RequestInit | undefined;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedInit = init;
      return Response.json({
        versions: [
          {
            createdBy: "11111111-1111-1111-1111-111111111111",
            effectiveFrom: "2026-07-15T00:00:00.000Z",
            id: "mapping-1",
            isCurrent: true,
            mappingDefinition: { A: "a", O: "o", P: "p", S: "s" },
            recordType: "support_activity",
            versionNo: 1,
          },
        ],
      });
    };

    const result = await addSoapMappingVersion(
      "support_activity",
      { A: "a", O: "o", P: "p", S: "s" },
      fetchFn,
    );

    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      mappingDefinition: { A: "a", O: "o", P: "p", S: "s" },
      recordType: "support_activity",
    });
    expect(result).toHaveLength(1);
  });
});

describe("listRequiredItems / addRequiredItem", () => {
  test("listRequiredItems は filters を query string に組み立てる", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({ items: [] });
    };

    await listRequiredItems(
      { recordType: "support_activity", specialtyId: "maternal-child" },
      fetchFn,
    );

    expect(requestedUrl).toBe(
      "/api/required-items?recordType=support_activity&specialtyId=maternal-child",
    );
  });

  test("addRequiredItem は body を JSON で POST する", async () => {
    const fetchFn = async () =>
      Response.json({
        aggregationCategory: "基本情報",
        id: "req-item-1",
        itemName: "訪問日時",
        recordType: "support_activity",
        requirementLevel: "required",
      });

    const result = await addRequiredItem(
      {
        aggregationCategory: "基本情報",
        itemName: "訪問日時",
        recordType: "support_activity",
        requirementLevel: "required",
      },
      fetchFn,
    );

    expect(result.id).toBe("req-item-1");
  });
});

describe("listQualityMetrics", () => {
  test("snake_case ではなく BFF が返した camelCase をそのまま使う", async () => {
    const fetchFn = async () =>
      Response.json({
        metrics: [
          {
            calculationDescription: "desc",
            displayName: "分類精度",
            metricKey: "classification_accuracy",
            targetEntity: "soap_record_versions",
          },
        ],
      });

    const result = await listQualityMetrics(fetchFn);

    expect(result).toEqual([
      {
        calculationDescription: "desc",
        displayName: "分類精度",
        metricKey: "classification_accuracy",
        targetEntity: "soap_record_versions",
      },
    ]);
  });
});
