import { describe, expect, test } from "bun:test";

import { listReferenceKnowledge } from "./reference-knowledge-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

class FakeRdsDataClient {
  async send(command: {
    constructor: { name: string };
    input?: Record<string, unknown>;
  }): Promise<unknown> {
    const sql =
      typeof command.input?.sql === "string" ? command.input.sql : undefined;
    if (sql?.includes("from reference_knowledge rk")) {
      return {
        formattedRecords: JSON.stringify([
          {
            external_kb_ref: "law-kb:child-abuse-prevention",
            id: "rk-1",
            linked_material_ids: JSON.stringify(["material-1"]),
            linked_rubric_ids: "[]",
            source_type: "law",
            summary: "児童虐待を発見した場合の通告義務を定める条文。",
            title: "児童虐待防止法 通告義務",
          },
        ]),
      };
    }
    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("listReferenceKnowledge", () => {
  test("linkedMaterialIds / linkedRubricIds を JSON 文字列から配列に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listReferenceKnowledge(CONFIG, {
      client: client as never,
    });

    expect(result).toEqual([
      {
        externalKbRef: "law-kb:child-abuse-prevention",
        id: "rk-1",
        linkedMaterialIds: ["material-1"],
        linkedRubricIds: [],
        sourceType: "law",
        summary: "児童虐待を発見した場合の通告義務を定める条文。",
        title: "児童虐待防止法 通告義務",
      },
    ]);
  });
});
