import { describe, expect, test } from "bun:test";

import {
  createRequiredItem,
  listRequiredItems,
} from "./required-item-store.ts";

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
    if (sql?.includes("insert into required_recommended_items")) {
      return {
        formattedRecords: JSON.stringify([
          {
            aggregation_category: "基本情報",
            id: "req-item-1",
            item_name: "訪問日時",
            record_type: "support_activity",
            requirement_level: "required",
            specialty_id: null,
          },
        ]),
      };
    }
    if (sql?.includes("from required_recommended_items")) {
      return {
        formattedRecords: JSON.stringify([
          {
            aggregation_category: "基本情報",
            id: "req-item-1",
            item_name: "訪問日時",
            record_type: "support_activity",
            requirement_level: "required",
            specialty_id: null,
          },
        ]),
      };
    }
    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("listRequiredItems", () => {
  test("specialty_id が null なら specialtyId を undefined にする", async () => {
    const client = new FakeRdsDataClient();
    const result = await listRequiredItems(CONFIG, undefined, {
      client: client as never,
    });

    expect(result).toEqual([
      {
        aggregationCategory: "基本情報",
        id: "req-item-1",
        itemName: "訪問日時",
        recordType: "support_activity",
        requirementLevel: "required",
        specialtyId: undefined,
      },
    ]);
  });
});

describe("createRequiredItem", () => {
  test("作成した項目を返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await createRequiredItem(
      CONFIG,
      {
        aggregationCategory: "基本情報",
        itemName: "訪問日時",
        recordType: "support_activity",
        requirementLevel: "required",
      },
      { client: client as never },
    );

    expect(result.id).toBe("req-item-1");
  });
});
