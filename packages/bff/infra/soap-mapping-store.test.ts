import { describe, expect, test } from "bun:test";

import {
  createSoapMappingVersion,
  listSoapMappingVersions,
} from "./soap-mapping-store.ts";

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
  nextVersionNo = 1;
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

    if (sql.includes("insert into app_users")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("update soap_mapping_versions")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("next_version_no")) {
      return {
        formattedRecords: JSON.stringify([
          { next_version_no: this.nextVersionNo },
        ]),
      };
    }
    if (sql.includes("insert into soap_mapping_versions")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("from soap_mapping_versions")) {
      return {
        formattedRecords: JSON.stringify([
          {
            created_by: "11111111-1111-1111-1111-111111111111",
            effective_from: "2026-07-15T00:00:00.000Z",
            id: "mapping-1",
            is_current: true,
            mapping_definition: JSON.stringify({
              A: "a",
              O: "o",
              P: "p",
              S: "s",
            }),
            record_type: "support_activity",
            version_no: 2,
          },
        ]),
      };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("listSoapMappingVersions", () => {
  test("mapping_definition を JSON 文字列から object に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listSoapMappingVersions(
      CONFIG,
      { recordType: "support_activity" },
      { client: client as never },
    );

    expect(result).toEqual([
      {
        createdBy: "11111111-1111-1111-1111-111111111111",
        effectiveFrom: "2026-07-15T00:00:00.000Z",
        id: "mapping-1",
        isCurrent: true,
        mappingDefinition: { A: "a", O: "o", P: "p", S: "s" },
        recordType: "support_activity",
        versionNo: 2,
      },
    ]);
  });
});

describe("createSoapMappingVersion", () => {
  test("既存バージョンの is_current を落とし、次の version_no で作って一覧を返す", async () => {
    const client = new FakeRdsDataClient();
    client.nextVersionNo = 3;

    const result = await createSoapMappingVersion(
      CONFIG,
      {
        createdBy: "11111111-1111-1111-1111-111111111111",
        mappingDefinition: { A: "a", O: "o", P: "p", S: "s" },
        recordType: "support_activity",
      },
      { client: client as never },
    );

    expect(result).toHaveLength(1);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("update soap_mapping_versions"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into soap_mapping_versions"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) => call.name === "CommitTransactionCommand"),
    ).toBe(true);
  });
});
