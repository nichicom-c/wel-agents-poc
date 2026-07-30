import { describe, expect, test } from "bun:test";

import {
  createSoapRecordVersion,
  listSoapRecords,
  listSoapRecordVersions,
  type SoapRecordStoreConfig,
} from "./soap-record-store.ts";

const CONFIG: SoapRecordStoreConfig = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

type RecordedCall = { name: string; sql?: string };

class FakeRdsDataClient {
  readonly calls: RecordedCall[] = [];
  nextVersionNo = 1;
  existingRecordId: string | undefined;
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
    if (sql.includes("insert into soap_records")) {
      return { formattedRecords: JSON.stringify([{ id: "record-new" }]) };
    }
    if (sql.includes("next_version_no")) {
      return {
        formattedRecords: JSON.stringify([
          { next_version_no: this.nextVersionNo },
        ]),
      };
    }
    if (sql.includes("insert into soap_record_versions")) {
      return { formattedRecords: JSON.stringify([{ id: "version-new" }]) };
    }
    if (
      sql.includes(
        "select id, record_type, status, created_by, created_at\n       from soap_records",
      )
    ) {
      return {
        formattedRecords: JSON.stringify([
          {
            created_at: "2026-07-30T00:00:00.000Z",
            created_by: "11111111-1111-1111-1111-111111111111",
            id: "record-1",
            record_type: "support_activity",
            status: "finalized",
          },
        ]),
      };
    }
    if (sql.includes("from soap_record_versions where record_id")) {
      return {
        formattedRecords: JSON.stringify([
          {
            content: [{ category: "S", text: "s text" }],
            created_at: "2026-07-30T00:00:00.000Z",
            created_by: "11111111-1111-1111-1111-111111111111",
            id: "version-1",
            record_id: "record-1",
            source: "soap_draft_ai",
            version_no: 1,
          },
          {
            // content が文字列で返る実装差異にも耐えられることを確認する。
            content: JSON.stringify([{ category: "A", text: "a text" }]),
            created_at: "2026-07-30T01:00:00.000Z",
            created_by: "11111111-1111-1111-1111-111111111111",
            id: "version-2",
            record_id: "record-1",
            source: "manual",
            version_no: 2,
          },
        ]),
      };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

const BASE_INPUT = {
  createdBy: "11111111-1111-1111-1111-111111111111",
  items: [{ category: "S" as const, text: "s text" }],
  recordType: "support_activity" as const,
  source: "soap_draft_ai" as const,
};

describe("createSoapRecordVersion", () => {
  test("recordId 省略時は新規記録 + version 1 を作る", async () => {
    const client = new FakeRdsDataClient();
    const result = await createSoapRecordVersion(CONFIG, BASE_INPUT, {
      client: client as never,
    });

    expect(result).toEqual({
      recordId: "record-new",
      versionId: "version-new",
      versionNo: 1,
    });
    expect(
      client.calls.some((call) => call.name === "CommitTransactionCommand"),
    ).toBe(true);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into soap_records"),
      ),
    ).toBe(true);
  });

  test("recordId 指定時は既存記録に version を追記し、次の version_no を使う", async () => {
    const client = new FakeRdsDataClient();
    client.nextVersionNo = 3;

    const result = await createSoapRecordVersion(
      CONFIG,
      { ...BASE_INPUT, recordId: "record-existing" },
      { client: client as never },
    );

    expect(result).toEqual({
      recordId: "record-existing",
      versionId: "version-new",
      versionNo: 3,
    });
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into soap_records"),
      ),
    ).toBe(false);
  });

  test("途中で失敗したらロールバックして例外を投げる", async () => {
    const client = new FakeRdsDataClient();
    client.failOnSql = "insert into soap_record_versions";

    await expect(
      createSoapRecordVersion(CONFIG, BASE_INPUT, { client: client as never }),
    ).rejects.toThrow("simulated failure");

    expect(
      client.calls.some((call) => call.name === "RollbackTransactionCommand"),
    ).toBe(true);
    expect(
      client.calls.some((call) => call.name === "CommitTransactionCommand"),
    ).toBe(false);
  });
});

describe("listSoapRecords", () => {
  test("snake_case の行を camelCase の SoapRecordSummary に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listSoapRecords(CONFIG, { client: client as never });

    expect(result).toEqual([
      {
        createdAt: "2026-07-30T00:00:00.000Z",
        createdBy: "11111111-1111-1111-1111-111111111111",
        id: "record-1",
        recordType: "support_activity",
        status: "finalized",
      },
    ]);
  });
});

describe("listSoapRecordVersions", () => {
  test("content が配列でも JSON 文字列でも SoapRecordItem[] に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listSoapRecordVersions(
      CONFIG,
      { recordId: "record-1" },
      { client: client as never },
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.items).toEqual([{ category: "S", text: "s text" }]);
    expect(result[1]?.items).toEqual([{ category: "A", text: "a text" }]);
    expect(result.map((version) => version.versionNo)).toEqual([1, 2]);
  });
});
