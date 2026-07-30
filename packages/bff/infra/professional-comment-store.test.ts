import { describe, expect, test } from "bun:test";

import {
  createProfessionalComment,
  listCommentsForVersion,
} from "./professional-comment-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
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
    if (sql.includes("insert into professional_comments")) {
      return {
        formattedRecords: JSON.stringify([
          { created_at: "2026-07-30T00:00:00.000Z", id: "comment-new" },
        ]),
      };
    }
    if (sql.includes("from professional_comments pc")) {
      return {
        formattedRecords: JSON.stringify([
          {
            author_id: "11111111-1111-1111-1111-111111111111",
            author_name: "鈴木 reviewer",
            author_role_at_post: "reviewer",
            body: "comment body",
            comment_type: "review",
            created_at: "2026-07-30T00:00:00.000Z",
            id: "comment-1",
            soap_category: "P",
            target_record_id: "record-1",
            target_record_version_id: "version-1",
          },
        ]),
      };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

const BASE_INPUT = {
  authorId: "11111111-1111-1111-1111-111111111111",
  authorRoleAtPost: "reviewer",
  body: "comment body",
  commentType: "review" as const,
  soapCategory: "P" as const,
  targetRecordId: "record-1",
  targetRecordVersionId: "version-1",
};

describe("createProfessionalComment", () => {
  test("author 表示名が無ければ authorRoleAtPost を authorName に使う", async () => {
    const client = new FakeRdsDataClient();
    const result = await createProfessionalComment(CONFIG, BASE_INPUT, {
      client: client as never,
    });

    expect(result).toEqual({
      authorId: BASE_INPUT.authorId,
      authorName: "reviewer",
      authorRoleAtPost: "reviewer",
      body: "comment body",
      commentType: "review",
      createdAt: "2026-07-30T00:00:00.000Z",
      id: "comment-new",
      soapCategory: "P",
      targetRecordId: "record-1",
      targetRecordVersionId: "version-1",
    });
    expect(
      client.calls.some((call) => call.name === "CommitTransactionCommand"),
    ).toBe(true);
  });

  test("表示名があれば authorName に使う", async () => {
    const client = new FakeRdsDataClient();
    const result = await createProfessionalComment(
      CONFIG,
      { ...BASE_INPUT, authorDisplayName: "reviewer@example.com" },
      { client: client as never },
    );

    expect(result.authorName).toBe("reviewer@example.com");
  });

  test("途中で失敗したらロールバックして例外を投げる", async () => {
    const client = new FakeRdsDataClient();
    client.failOnSql = "insert into professional_comments";

    await expect(
      createProfessionalComment(CONFIG, BASE_INPUT, {
        client: client as never,
      }),
    ).rejects.toThrow("simulated failure");

    expect(
      client.calls.some((call) => call.name === "RollbackTransactionCommand"),
    ).toBe(true);
  });
});

describe("listCommentsForVersion", () => {
  test("snake_case の行を camelCase の ProfessionalComment に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listCommentsForVersion(
      CONFIG,
      { targetRecordVersionId: "version-1" },
      { client: client as never },
    );

    expect(result).toEqual([
      {
        authorId: "11111111-1111-1111-1111-111111111111",
        authorName: "鈴木 reviewer",
        authorRoleAtPost: "reviewer",
        body: "comment body",
        commentType: "review",
        createdAt: "2026-07-30T00:00:00.000Z",
        id: "comment-1",
        soapCategory: "P",
        targetRecordId: "record-1",
        targetRecordVersionId: "version-1",
      },
    ]);
  });
});
