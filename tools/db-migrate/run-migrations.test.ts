import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  listMigrationFiles,
  type MigrationTarget,
  migrationTargetFromEnv,
  runMigrations,
  splitSqlStatements,
} from "./run-migrations.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

async function tempMigrationsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "db-migrate-"));
  tempDirs.push(dir);
  return dir;
}

const TARGET: MigrationTarget = {
  database: "training_data",
  resourceArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:training-data",
};

type RecordedCommand = { name: string; input?: Record<string, unknown> };

class FakeRdsDataClient {
  readonly calls: RecordedCommand[] = [];
  readonly insertedFilenames: string[] = [];
  private readonly preAppliedFilenames: string[];
  private txCounter = 0;

  constructor(preAppliedFilenames: string[] = []) {
    this.preAppliedFilenames = preAppliedFilenames;
  }

  async send(command: {
    constructor: { name: string };
    input?: Record<string, unknown>;
  }): Promise<unknown> {
    const name = command.constructor.name;
    this.calls.push({ input: command.input, name });

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
    if (name === "ExecuteStatementCommand") {
      const sql = String(command.input?.sql ?? "");
      if (sql.includes("fail_this_statement")) {
        throw new Error("simulated failure");
      }
      if (sql.trim().startsWith("select filename from schema_migrations")) {
        return {
          records: [...this.preAppliedFilenames, ...this.insertedFilenames].map(
            (filename) => [{ stringValue: filename }],
          ),
        };
      }
      if (sql.startsWith("insert into schema_migrations")) {
        const literalMatch = sql.match(/values \('(.+)'\)/);
        if (literalMatch?.[1]) {
          this.insertedFilenames.push(literalMatch[1].replaceAll("''", "'"));
        }
      }
      return {};
    }
    throw new Error(`unexpected command: ${name}`);
  }
}

describe("migrationTargetFromEnv", () => {
  test("必要な3変数が揃っていれば target を返す", () => {
    const target = migrationTargetFromEnv({
      AWS_REGION: "ap-northeast-1",
      TRAINING_DATA_CLUSTER_ARN: "arn:aws:rds:cluster",
      TRAINING_DATA_DATABASE_NAME: "training_data",
      TRAINING_DATA_SECRET_ARN: "arn:aws:secretsmanager:secret",
    });

    expect(target).toEqual({
      database: "training_data",
      region: "ap-northeast-1",
      resourceArn: "arn:aws:rds:cluster",
      secretArn: "arn:aws:secretsmanager:secret",
    });
  });

  test("必須変数が無ければ不足分の変数名を含めて例外を投げる", () => {
    expect(() => migrationTargetFromEnv({})).toThrow(
      /TRAINING_DATA_CLUSTER_ARN/,
    );
    expect(() => migrationTargetFromEnv({})).toThrow(
      /TRAINING_DATA_SECRET_ARN/,
    );
    expect(() => migrationTargetFromEnv({})).toThrow(
      /TRAINING_DATA_DATABASE_NAME/,
    );
  });
});

describe("splitSqlStatements", () => {
  test("セミコロン+改行で文を分割し、空文とコメント行を除く", () => {
    const statements = splitSqlStatements(
      "-- header comment\ncreate table a (id text);\n\ncreate table b (id text);\n",
    );

    expect(statements).toEqual([
      "create table a (id text)",
      "create table b (id text)",
    ]);
  });
});

describe("listMigrationFiles", () => {
  test(".sql ファイルだけを名前順で返す", async () => {
    const dir = await tempMigrationsDir();
    await writeFile(join(dir, "0002_b.sql"), "select 1;\n");
    await writeFile(join(dir, "0001_a.sql"), "select 1;\n");
    await writeFile(join(dir, "notes.txt"), "not a migration");

    expect(await listMigrationFiles(dir)).toEqual(["0001_a.sql", "0002_b.sql"]);
  });
});

describe("runMigrations", () => {
  test("未適用のファイルだけを版番号順に適用し、ファイル名を記録する", async () => {
    const dir = await tempMigrationsDir();
    await writeFile(join(dir, "0001_init.sql"), "create table a (id text);\n");
    await writeFile(
      join(dir, "0002_seed.sql"),
      "insert into a values ('x');\n",
    );

    const client = new FakeRdsDataClient();
    const applied = await runMigrations(TARGET, dir, {
      client: client as never,
    });

    expect(applied).toEqual(["0001_init.sql", "0002_seed.sql"]);
    expect(client.insertedFilenames).toEqual([
      "0001_init.sql",
      "0002_seed.sql",
    ]);
  });

  test("既に適用済みのファイルはスキップする", async () => {
    const dir = await tempMigrationsDir();
    await writeFile(join(dir, "0001_init.sql"), "create table a (id text);\n");
    await writeFile(
      join(dir, "0002_seed.sql"),
      "insert into a values ('x');\n",
    );

    const client = new FakeRdsDataClient(["0001_init.sql"]);
    const applied = await runMigrations(TARGET, dir, {
      client: client as never,
    });

    expect(applied).toEqual(["0002_seed.sql"]);
  });

  test("文の実行に失敗したファイルはロールバックし、適用済みに記録しない", async () => {
    const dir = await tempMigrationsDir();
    await writeFile(
      join(dir, "0001_fail.sql"),
      "select fail_this_statement();\n",
    );

    const client = new FakeRdsDataClient();
    await expect(
      runMigrations(TARGET, dir, { client: client as never }),
    ).rejects.toThrow("simulated failure");

    expect(client.insertedFilenames).toEqual([]);
    expect(
      client.calls.some((call) => call.name === "RollbackTransactionCommand"),
    ).toBe(true);
  });
});
