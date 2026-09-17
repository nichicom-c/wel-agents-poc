import { describe, expect, test } from "bun:test";

import { getMasters } from "./master-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

class FakeRdsDataClient {
  readonly executedSql: string[] = [];

  async send(command: { input?: Record<string, unknown> }): Promise<unknown> {
    const sql = typeof command.input?.sql === "string" ? command.input.sql : "";
    this.executedSql.push(sql);

    if (sql.includes("from specialties")) {
      return {
        formattedRecords: JSON.stringify([
          { id: "maternal-child", label: "母子保健" },
        ]),
      };
    }
    if (sql.includes("from learning_themes")) {
      return {
        formattedRecords: JSON.stringify([
          { id: "documentation", label: "記録表現" },
        ]),
      };
    }
    if (sql.includes("from difficulty_levels")) {
      return {
        formattedRecords: JSON.stringify([
          { id: "beginner", label: "初級" },
          { id: "intermediate", label: "中級" },
        ]),
      };
    }
    if (sql.includes("from rejection_reason_codes")) {
      return {
        formattedRecords: JSON.stringify([{ code: "other", label: "その他" }]),
      };
    }
    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("getMasters", () => {
  test("4種のマスタを1回の呼び出しでまとめて返す", async () => {
    const client = new FakeRdsDataClient();

    const masters = await getMasters(CONFIG, { client: client as never });

    expect(masters).toEqual({
      difficultyLevels: [
        { id: "beginner", label: "初級" },
        { id: "intermediate", label: "中級" },
      ],
      learningThemes: [{ id: "documentation", label: "記録表現" }],
      rejectionReasonCodes: [{ code: "other", label: "その他" }],
      specialties: [{ id: "maternal-child", label: "母子保健" }],
    });
  });

  test("難易度は order_no、他は id/code で並び順を固定する", async () => {
    const client = new FakeRdsDataClient();

    await getMasters(CONFIG, { client: client as never });

    const sqlFor = (table: string) =>
      client.executedSql.find((sql) => sql.includes(`from ${table}`)) ?? "";
    expect(sqlFor("difficulty_levels")).toContain("order by order_no asc");
    expect(sqlFor("specialties")).toContain("order by id asc");
    expect(sqlFor("learning_themes")).toContain("order by id asc");
    expect(sqlFor("rejection_reason_codes")).toContain("order by code asc");
  });
});
