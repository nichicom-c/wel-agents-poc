/**
 * Training Data Store を「`migrations/*.sql` を初回適用しただけの状態」へ戻す。
 * `drop schema public cascade` + `create schema public` で schema_migrations ごと落としてから、
 * `run-migrations.ts` の適用を走らせる。
 *
 * この repo は差分 migration を積まず、スキーマを変えたら `0001_init.sql` を直接書き換えて DB を
 * 作り直す運用（terraform/aws/bff/README.md の「Training Data Store」節）。その作り直しを1コマンド
 * にしたもので、`training-data:migrate` と同じ3つの環境変数を読む。
 *
 * [WARNING] Training Data Store の全データが消える。マスタと Knowledge Base 層は
 * 0002 / 0003 が入れ直すが、画面から作った SOAP 正式記録・専門職コメント・教材候補・教材は
 * 復元されない。誤実行を防ぐため `--yes` を必須にしている。
 */

import {
  ExecuteStatementCommand,
  RDSDataClient,
} from "@aws-sdk/client-rds-data";

import {
  DEFAULT_MIGRATIONS_DIR,
  type MigrationTarget,
  migrationTargetFromEnv,
  runMigrations,
} from "./run-migrations.ts";

/** Data API は1回の ExecuteStatement に1文しか渡せないため、順に発行する。 */
export const RESET_STATEMENTS = [
  "drop schema public cascade",
  "create schema public",
] as const;

export type ResetSchemaDeps = {
  client?: RDSDataClient;
};

/** `public` schema を作り直す（この時点で schema_migrations も消える）。 */
export async function resetSchema(
  target: MigrationTarget,
  deps: ResetSchemaDeps = {},
): Promise<void> {
  const client =
    deps.client ??
    new RDSDataClient(target.region ? { region: target.region } : {});

  for (const sql of RESET_STATEMENTS) {
    await client.send(
      new ExecuteStatementCommand({
        database: target.database,
        resourceArn: target.resourceArn,
        secretArn: target.secretArn,
        sql,
      }),
    );
  }
}

/** `--yes` が渡されたかどうか。destructive なので既定では実行しない。 */
export function hasConfirmFlag(argv: readonly string[]): boolean {
  return argv.includes("--yes");
}

async function main(): Promise<void> {
  if (!hasConfirmFlag(process.argv.slice(2))) {
    console.error(
      "[NG] Training Data Store の全データを削除して作り直す。実行するには --yes を付ける:",
    );
    console.error("     bun run training-data:reset -- --yes");
    process.exitCode = 1;
    return;
  }

  const target = migrationTargetFromEnv();
  console.log(`[INFO] drop schema public cascade (${target.database})`);
  await resetSchema(target);
  console.log("[OK] schema public を作り直した");

  const applied = await runMigrations(target, DEFAULT_MIGRATIONS_DIR, {
    onRetiredFilenames: (filenames) => {
      console.warn(
        `[WARNING] 作り直し直後なのに記録が残っている（想定外）: ${filenames.join(", ")}`,
      );
    },
  });
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
