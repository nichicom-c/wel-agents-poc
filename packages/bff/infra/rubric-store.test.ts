import { describe, expect, test } from "bun:test";

import { createRubric, listRubrics, setRubricActive } from "./rubric-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

const KNOWLEDGE_BASE_ID = "10000000-0000-0000-0000-000000000001";

const RUBRIC_LEVELS = [
  {
    criteria: ["a"],
    definition: "定義1",
    level: 1 as const,
    levelName: "要支援",
  },
  {
    criteria: ["b"],
    definition: "定義2",
    level: 2 as const,
    levelName: "基礎",
  },
  {
    criteria: ["c"],
    definition: "定義3",
    level: 3 as const,
    levelName: "自立",
  },
  {
    criteria: ["d"],
    definition: "定義4",
    level: 4 as const,
    levelName: "熟達",
  },
];

const RUBRIC_ROW = {
  code: "ASSESSMENT",
  created_at: "2026-07-18T09:00:00.000Z",
  id: "rubric-1",
  is_active: true,
  knowledge_base_id: KNOWLEDGE_BASE_ID,
  levels: JSON.stringify(RUBRIC_LEVELS),
  name: "アセスメント",
  objective: "S/Oを根拠に評価できる",
  sort_order: 40,
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

    if (sql.includes("insert into rubric ")) {
      return { formattedRecords: JSON.stringify([{ id: "rubric-1" }]) };
    }
    if (sql.includes("insert into rubric_level")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("update rubric ")) {
      return { formattedRecords: JSON.stringify([{ id: "rubric-1" }]) };
    }
    if (sql.includes("from rubric r") && sql.includes("where r.id")) {
      return { formattedRecords: JSON.stringify([RUBRIC_ROW]) };
    }
    if (
      sql.includes("from rubric r") &&
      sql.includes("order by r.sort_order")
    ) {
      return { formattedRecords: JSON.stringify([RUBRIC_ROW]) };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("listRubrics", () => {
  test("levels を JSON 文字列から配列に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listRubrics(CONFIG, { client: client as never });

    expect(result).toHaveLength(1);
    expect(result[0]?.levels).toEqual(RUBRIC_LEVELS);
    expect(result[0]?.isActive).toBe(true);
  });
});

describe("createRubric", () => {
  test("rubric と4レベルを作り、作成後のルーブリックを返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await createRubric(
      CONFIG,
      {
        code: "ASSESSMENT",
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        levels: RUBRIC_LEVELS,
        name: "アセスメント",
        objective: "S/Oを根拠に評価できる",
        sortOrder: 40,
      },
      { client: client as never },
    );

    expect(result.id).toBe("rubric-1");
    expect(result.levels).toEqual(RUBRIC_LEVELS);

    const levelInserts = client.calls.filter((call) =>
      call.sql?.includes("insert into rubric_level"),
    );
    expect(levelInserts).toHaveLength(4);
  });

  test("途中で失敗したらロールバックして例外を投げる", async () => {
    const client = new FakeRdsDataClient();
    client.failOnSql = "insert into rubric ";

    await expect(
      createRubric(
        CONFIG,
        {
          code: "ASSESSMENT",
          knowledgeBaseId: KNOWLEDGE_BASE_ID,
          levels: RUBRIC_LEVELS,
          name: "x",
          objective: "y",
        },
        { client: client as never },
      ),
    ).rejects.toThrow("simulated failure");

    expect(
      client.calls.some((call) => call.name === "RollbackTransactionCommand"),
    ).toBe(true);
  });
});

describe("setRubricActive", () => {
  test("is_active を更新し、更新後のルーブリックを返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await setRubricActive(
      CONFIG,
      { id: "rubric-1", isActive: false },
      { client: client as never },
    );

    expect(result.id).toBe("rubric-1");
  });
});
