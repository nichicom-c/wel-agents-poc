/**
 * `terraform/aws/bff/migrations/*.sql` を RDS Data API 経由で順に適用する軽量マイグレーション
 * ランナー。ORM は使わず（repo の既存流儀）、適用済みファイル名は対象 DB 自身の
 * `schema_migrations` テーブルで管理する。1ファイル = 1トランザクションで適用し、
 * 失敗したファイルはロールバックする。
 *
 * 対象は issue #8/#9/#10 の dummy データ実装（packages/workbench）を実 DB に切り替えるための
 * Aurora Serverless v2（PostgreSQL）+ RDS Data API。設計は
 * docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md を参照。
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MIGRATIONS_DIR = join(
  SCRIPT_DIR,
  "../../terraform/aws/bff/migrations",
);

export type MigrationTarget = {
  resourceArn: string;
  secretArn: string;
  database: string;
  region?: string;
};

export type EnvSource = Record<string, string | undefined>;

/** `terraform -chdir=terraform/aws/bff output training_data_migrate_env` が出す3変数を読む。 */
export function migrationTargetFromEnv(
  env: EnvSource = process.env,
): MigrationTarget {
  const resourceArn = env.TRAINING_DATA_CLUSTER_ARN?.trim();
  const secretArn = env.TRAINING_DATA_SECRET_ARN?.trim();
  const database = env.TRAINING_DATA_DATABASE_NAME?.trim();
  const missing: string[] = [];
  if (!resourceArn) {
    missing.push("TRAINING_DATA_CLUSTER_ARN");
  }
  if (!secretArn) {
    missing.push("TRAINING_DATA_SECRET_ARN");
  }
  if (!database) {
    missing.push("TRAINING_DATA_DATABASE_NAME");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required env for migration: ${missing.join(", ")}`,
    );
  }
  return {
    database: database as string,
    region: env.AWS_REGION?.trim() || undefined,
    resourceArn: resourceArn as string,
    secretArn: secretArn as string,
  };
}

/**
 * `;` の直後の改行区切りだけを文単位の区切りとして扱う簡易 SQL 分割。マイグレーション
 * ファイルは文字列リテラル内にセミコロンを含まない DDL/DML だけを対象にするため、
 * フルの SQL パーサは持たない。
 */
export function splitSqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutLineComments
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

async function execute(
  client: RDSDataClient,
  target: MigrationTarget,
  sql: string,
  transactionId?: string,
) {
  return client.send(
    new ExecuteStatementCommand({
      database: target.database,
      resourceArn: target.resourceArn,
      secretArn: target.secretArn,
      sql,
      transactionId,
    }),
  );
}

async function ensureMigrationsTable(
  client: RDSDataClient,
  target: MigrationTarget,
): Promise<void> {
  await execute(
    client,
    target,
    `create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`,
  );
}

async function appliedMigrations(
  client: RDSDataClient,
  target: MigrationTarget,
): Promise<Set<string>> {
  const result = await execute(
    client,
    target,
    "select filename from schema_migrations",
  );
  const filenames = (result.records ?? [])
    .map((record) => record[0]?.stringValue)
    .filter((value): value is string => typeof value === "string");
  return new Set(filenames);
}

async function applyMigrationFile(
  client: RDSDataClient,
  target: MigrationTarget,
  migrationsDir: string,
  filename: string,
): Promise<void> {
  const sql = await readFile(join(migrationsDir, filename), "utf-8");
  const statements = splitSqlStatements(sql);

  const beginResult = await client.send(
    new BeginTransactionCommand({
      database: target.database,
      resourceArn: target.resourceArn,
      secretArn: target.secretArn,
    }),
  );
  const transactionId = beginResult.transactionId;
  if (!transactionId) {
    throw new Error(`failed to begin transaction for ${filename}`);
  }

  try {
    for (const statement of statements) {
      await execute(client, target, statement, transactionId);
    }
    await execute(
      client,
      target,
      `insert into schema_migrations (filename) values ('${escapeSqlLiteral(filename)}')`,
      transactionId,
    );
    await client.send(
      new CommitTransactionCommand({
        resourceArn: target.resourceArn,
        secretArn: target.secretArn,
        transactionId,
      }),
    );
  } catch (error) {
    await client
      .send(
        new RollbackTransactionCommand({
          resourceArn: target.resourceArn,
          secretArn: target.secretArn,
          transactionId,
        }),
      )
      .catch(() => {});
    throw error;
  }
}

export type RunMigrationsDeps = {
  client?: RDSDataClient;
};

/** 未適用のファイルだけを版番号順に適用し、新たに適用したファイル名を返す。 */
export async function runMigrations(
  target: MigrationTarget,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
  deps: RunMigrationsDeps = {},
): Promise<string[]> {
  const client =
    deps.client ??
    new RDSDataClient(target.region ? { region: target.region } : {});
  await ensureMigrationsTable(client, target);
  const applied = await appliedMigrations(client, target);
  const files = await listMigrationFiles(migrationsDir);

  const newlyApplied: string[] = [];
  for (const filename of files) {
    if (applied.has(filename)) {
      continue;
    }
    await applyMigrationFile(client, target, migrationsDir, filename);
    newlyApplied.push(filename);
  }
  return newlyApplied;
}

async function main(): Promise<void> {
  const target = migrationTargetFromEnv();
  const applied = await runMigrations(target);
  if (applied.length === 0) {
    console.log("[OK] no pending migrations");
    return;
  }
  for (const filename of applied) {
    console.log(`[OK] applied ${filename}`);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
