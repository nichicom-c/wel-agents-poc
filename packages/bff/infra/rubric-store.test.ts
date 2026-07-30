import { describe, expect, test } from "bun:test";

import {
  createRubric,
  listRubrics,
  setRubricReviewStatus,
} from "./rubric-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

const RUBRIC_ROW = {
  created_at: "2026-07-18T09:00:00.000Z",
  created_by: "11111111-1111-1111-1111-111111111111",
  id: "rubric-1",
  items: JSON.stringify([
    {
      criterionName: "根拠の明確さ",
      description: "S/O が A を支えているか。",
      id: "item-1",
    },
  ]),
  name: "支援方針アセスメントルーブリック",
  review_status: "expert_review_required",
  target_type: "exercise_feedback",
  version_no: 1,
};

type RecordedCall = { name: string; sql?: string };

class FakeRdsDataClient {
  readonly calls: RecordedCall[] = [];
  failOnSql: string | undefined;
  private txCounter = 0;

  async send(command: {
    constructor: { name: string };
    input?: Record<string, unknown>;
  }): Promise<unknown> {
    const name = command.constructor.name;
    const sql =
      typeof command.input?.sql === "string" ? command.input.sql : undefined;
    this.calls.push({ name, sql });

    if (name === "BeginTransactionCommand") {
      this.txCounter += 1;
      return { transactionId: `tx-${this.txCounter}` };
    }
    if (
      name === "CommitTransactionCommand" ||
      name === "RollbackTransactionCommand"
    ) {
      return {};
    }
    if (name !== "ExecuteStatementCommand" || !sql) {
      throw new Error(`unexpected command: ${name}`);
    }
    if (this.failOnSql && sql.includes(this.failOnSql)) {
      throw new Error("simulated failure");
    }

    if (sql.includes("insert into app_users")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("insert into rubrics")) {
      return {
        formattedRecords: JSON.stringify([{ ...RUBRIC_ROW, items: [] }]),
      };
    }
    if (sql.includes("update rubrics")) {
      return { formattedRecords: JSON.stringify([{ id: "rubric-1" }]) };
    }
    if (sql.includes("from rubrics r") && sql.includes("where r.id")) {
      return {
        formattedRecords: JSON.stringify([
          { ...RUBRIC_ROW, review_status: "confirmed" },
        ]),
      };
    }
    if (
      sql.includes("from rubrics r") &&
      sql.includes("order by r.created_at")
    ) {
      return { formattedRecords: JSON.stringify([RUBRIC_ROW]) };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("listRubrics", () => {
  test("items を JSON 文字列から配列に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listRubrics(CONFIG, { client: client as never });

    expect(result).toHaveLength(1);
    expect(result[0]?.items).toEqual([
      {
        criterionName: "根拠の明確さ",
        description: "S/O が A を支えているか。",
        id: "item-1",
      },
    ]);
  });
});

describe("createRubric", () => {
  test("review_status: expert_review_required, version 1, items: [] で作る", async () => {
    const client = new FakeRdsDataClient();
    const result = await createRubric(
      CONFIG,
      {
        createdBy: "11111111-1111-1111-1111-111111111111",
        name: "支援方針アセスメントルーブリック",
        targetType: "exercise_feedback",
      },
      { client: client as never },
    );

    expect(result.reviewStatus).toBe("expert_review_required");
    expect(result.versionNo).toBe(1);
    expect(result.items).toEqual([]);
  });

  test("途中で失敗したらロールバックして例外を投げる", async () => {
    const client = new FakeRdsDataClient();
    client.failOnSql = "insert into rubrics";

    await expect(
      createRubric(
        CONFIG,
        {
          createdBy: "11111111-1111-1111-1111-111111111111",
          name: "x",
          targetType: "exercise_feedback",
        },
        { client: client as never },
      ),
    ).rejects.toThrow("simulated failure");

    expect(
      client.calls.some((call) => call.name === "RollbackTransactionCommand"),
    ).toBe(true);
  });
});

describe("setRubricReviewStatus", () => {
  test("review_status を更新し、更新後のルーブリックを返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await setRubricReviewStatus(
      CONFIG,
      { id: "rubric-1", nextStatus: "confirmed" },
      { client: client as never },
    );

    expect(result.reviewStatus).toBe("confirmed");
  });
});
