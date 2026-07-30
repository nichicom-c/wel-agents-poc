import { describe, expect, test } from "bun:test";

import {
  createMaterialCandidateFromComments,
  decideMaterialCandidateStatus,
  listMaterialCandidates,
} from "./material-candidate-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

const CANDIDATE_ROW = {
  comments: JSON.stringify([
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
  ]),
  created_at: "2026-07-19T10:00:00.000Z",
  created_by: "11111111-1111-1111-1111-111111111111",
  difficulty_id: "intermediate",
  id: "candidate-1",
  learning_theme_id: "support-planning",
  record_type: "support_activity",
  rejection_reason_code: null,
  specialty_id: "maternal-child",
  status: "candidate",
  status_history: JSON.stringify([
    {
      changedAt: "2026-07-19T10:00:00.000Z",
      changedBy: "11111111-1111-1111-1111-111111111111",
      changedByRole: "reviewer",
      fromStatus: null,
      reasonText: null,
      toStatus: "candidate",
    },
  ]),
  summary: "summary text",
  title: "title text",
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
    if (sql.includes("insert into material_candidates")) {
      return { formattedRecords: JSON.stringify([{ id: "candidate-1" }]) };
    }
    if (sql.includes("insert into material_candidate_comments")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("insert into material_candidate_status_events")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("select status from material_candidates")) {
      return { formattedRecords: JSON.stringify([{ status: "candidate" }]) };
    }
    if (sql.includes("update material_candidates")) {
      return { formattedRecords: "[]" };
    }
    if (
      sql.includes("from material_candidates mc") &&
      sql.includes("where mc.id")
    ) {
      return { formattedRecords: JSON.stringify([CANDIDATE_ROW]) };
    }
    if (
      sql.includes("from material_candidates mc") &&
      sql.includes("where (:specialtyId")
    ) {
      return { formattedRecords: JSON.stringify([CANDIDATE_ROW]) };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("listMaterialCandidates", () => {
  test("comments / statusHistory を JSON 文字列から camelCase の配列に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listMaterialCandidates(CONFIG, undefined, {
      client: client as never,
    });

    expect(result).toEqual([
      {
        comments: [
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
        ],
        createdAt: "2026-07-19T10:00:00.000Z",
        createdBy: "11111111-1111-1111-1111-111111111111",
        difficultyId: "intermediate",
        id: "candidate-1",
        learningThemeId: "support-planning",
        recordType: "support_activity",
        rejectionReasonCode: undefined,
        specialtyId: "maternal-child",
        status: "candidate",
        statusHistory: [
          {
            changedAt: "2026-07-19T10:00:00.000Z",
            changedBy: "11111111-1111-1111-1111-111111111111",
            changedByRole: "reviewer",
            fromStatus: null,
            reasonText: undefined,
            toStatus: "candidate",
          },
        ],
        summary: "summary text",
        title: "title text",
      },
    ]);
  });
});

describe("createMaterialCandidateFromComments", () => {
  test("候補・紐づくコメント・初回状態イベントを作り、作成後の候補を返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await createMaterialCandidateFromComments(
      CONFIG,
      {
        commentIds: ["comment-1"],
        createdBy: "11111111-1111-1111-1111-111111111111",
        createdByRole: "reviewer",
        difficultyId: "intermediate",
        learningThemeId: "support-planning",
        recordType: "support_activity",
        specialtyId: "maternal-child",
        summary: "summary text",
        title: "title text",
      },
      { client: client as never },
    );

    expect(result.id).toBe("candidate-1");
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into material_candidate_comments"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into material_candidate_status_events"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) => call.name === "CommitTransactionCommand"),
    ).toBe(true);
  });

  test("途中で失敗したらロールバックして例外を投げる", async () => {
    const client = new FakeRdsDataClient();
    client.failOnSql = "insert into material_candidate_comments";

    await expect(
      createMaterialCandidateFromComments(
        CONFIG,
        {
          commentIds: ["comment-1"],
          createdBy: "11111111-1111-1111-1111-111111111111",
          createdByRole: "reviewer",
          summary: "summary text",
          title: "title text",
        },
        { client: client as never },
      ),
    ).rejects.toThrow("simulated failure");

    expect(
      client.calls.some((call) => call.name === "RollbackTransactionCommand"),
    ).toBe(true);
  });
});

describe("decideMaterialCandidateStatus", () => {
  test("状態を更新し、状態イベントを積んで更新後の候補を返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await decideMaterialCandidateStatus(
      CONFIG,
      {
        changedBy: "22222222-2222-2222-2222-222222222222",
        changedByRole: "reviewer",
        id: "candidate-1",
        nextStatus: "approved",
      },
      { client: client as never },
    );

    expect(result.id).toBe("candidate-1");
    expect(
      client.calls.some((call) =>
        call.sql?.includes("update material_candidates"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into material_candidate_status_events"),
      ),
    ).toBe(true);
  });

  test("候補が存在しなければ例外を投げる", async () => {
    class NotFoundClient extends FakeRdsDataClient {
      override async send(command: {
        constructor: { name: string };
        input?: Record<string, unknown>;
      }): Promise<unknown> {
        const sql =
          typeof command.input?.sql === "string"
            ? command.input.sql
            : undefined;
        if (sql?.includes("select status from material_candidates")) {
          return { formattedRecords: "[]" };
        }
        return super.send(command);
      }
    }
    const notFoundClient = new NotFoundClient();

    await expect(
      decideMaterialCandidateStatus(
        CONFIG,
        {
          changedBy: "22222222-2222-2222-2222-222222222222",
          changedByRole: "reviewer",
          id: "missing",
          nextStatus: "approved",
        },
        { client: notFoundClient as never },
      ),
    ).rejects.toThrow("material candidate not found");
  });
});
