import { describe, expect, test } from "bun:test";

import {
  changeMaterialStatus,
  createMaterial,
  listMaterials,
} from "./material-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

const MATERIAL_ROW = {
  created_at: "2026-07-20T09:00:00.000Z",
  created_by: "11111111-1111-1111-1111-111111111111",
  difficulty_id: "beginner",
  id: "material-1",
  learning_theme_id: "documentation",
  material_type: "comment_derived_note",
  publication_status: "draft",
  revisions: JSON.stringify([
    {
      changedAt: "2026-07-20T09:00:00.000Z",
      changedBy: "11111111-1111-1111-1111-111111111111",
      fromStatus: null,
      toStatus: "draft",
    },
  ]),
  specialty_id: "elderly-care",
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
    if (sql.includes("insert into materials")) {
      return { formattedRecords: JSON.stringify([{ id: "material-1" }]) };
    }
    if (sql.includes("insert into material_revisions")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("select publication_status from materials")) {
      return {
        formattedRecords: JSON.stringify([{ publication_status: "draft" }]),
      };
    }
    if (sql.includes("update materials")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("from materials m") && sql.includes("where m.id")) {
      return { formattedRecords: JSON.stringify([MATERIAL_ROW]) };
    }
    if (
      sql.includes("from materials m") &&
      sql.includes("where (:materialType")
    ) {
      return { formattedRecords: JSON.stringify([MATERIAL_ROW]) };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("listMaterials", () => {
  test("revisions を JSON 文字列から配列に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listMaterials(CONFIG, undefined, {
      client: client as never,
    });

    expect(result).toEqual([
      {
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
      },
    ]);
  });
});

describe("createMaterial", () => {
  test("status: draft で作り、初回 revision を積む", async () => {
    const client = new FakeRdsDataClient();
    const result = await createMaterial(
      CONFIG,
      {
        createdBy: "11111111-1111-1111-1111-111111111111",
        difficultyId: "beginner",
        learningThemeId: "documentation",
        materialType: "comment_derived_note",
        specialtyId: "elderly-care",
        title: "title text",
      },
      { client: client as never },
    );

    expect(result.id).toBe("material-1");
    expect(result.publicationStatus).toBe("draft");
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into material_revisions"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) => call.name === "CommitTransactionCommand"),
    ).toBe(true);
  });

  test("途中で失敗したらロールバックして例外を投げる", async () => {
    const client = new FakeRdsDataClient();
    client.failOnSql = "insert into material_revisions";

    await expect(
      createMaterial(
        CONFIG,
        {
          createdBy: "11111111-1111-1111-1111-111111111111",
          materialType: "comment_derived_note",
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

describe("changeMaterialStatus", () => {
  test("公開状態を更新し、revision を積んで更新後の教材を返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await changeMaterialStatus(
      CONFIG,
      {
        changedBy: "22222222-2222-2222-2222-222222222222",
        id: "material-1",
        nextStatus: "reviewing",
      },
      { client: client as never },
    );

    expect(result.id).toBe("material-1");
    expect(
      client.calls.some((call) => call.sql?.includes("update materials")),
    ).toBe(true);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into material_revisions"),
      ),
    ).toBe(true);
  });
});
