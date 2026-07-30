import { describe, expect, test } from "bun:test";

import {
  type ReferenceKnowledge,
  referenceKnowledgeLinkedToMaterial,
  referenceKnowledgeLinkedToRubric,
} from "./reference-knowledge.ts";

const ITEMS: ReferenceKnowledge[] = [
  {
    id: "rk-1",
    linkedMaterialIds: ["material-1"],
    linkedRubricIds: ["rubric-1"],
    sourceType: "law",
    summary: "summary-1",
    title: "title-1",
  },
  {
    id: "rk-2",
    linkedMaterialIds: [],
    linkedRubricIds: ["rubric-1"],
    sourceType: "internal_note",
    summary: "summary-2",
    title: "title-2",
  },
];

describe("referenceKnowledgeLinkedToMaterial", () => {
  test("指定した教材に紐づく参照知識だけを返す", () => {
    const result = referenceKnowledgeLinkedToMaterial(ITEMS, "material-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("rk-1");
  });

  test("紐づく参照知識が無ければ空配列を返す", () => {
    expect(
      referenceKnowledgeLinkedToMaterial(ITEMS, "material-9"),
    ).toHaveLength(0);
  });
});

describe("referenceKnowledgeLinkedToRubric", () => {
  test("指定したルーブリックに紐づく参照知識をすべて返す", () => {
    expect(referenceKnowledgeLinkedToRubric(ITEMS, "rubric-1")).toHaveLength(2);
  });
});
