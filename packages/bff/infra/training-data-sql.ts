import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";

/**
 * Training Data Store（Aurora Serverless v2 + RDS Data API）向けの SQL helper。
 * `soap-record-store.ts` / `professional-comment-store.ts` / `material-candidate-store.ts`
 * が共通で使う接続設定・パラメータ組み立て・実行・行 parse をここに集約する。
 */

export type TrainingDataStoreConfig = {
  clusterArn: string;
  secretArn: string;
  database: string;
  region: string;
};

export type TrainingDataStoreDeps = {
  client?: RDSDataClient;
};

export function resolveClient(
  config: TrainingDataStoreConfig,
  deps: TrainingDataStoreDeps,
): RDSDataClient {
  return deps.client ?? new RDSDataClient({ region: config.region });
}

export function stringParam(name: string, value: string): SqlParameter {
  return { name, value: { stringValue: value } };
}

export function nullableStringParam(
  name: string,
  value: string | undefined,
): SqlParameter {
  return value ? stringParam(name, value) : { name, value: { isNull: true } };
}

export function jsonParam(name: string, value: unknown): SqlParameter {
  return {
    name,
    typeHint: "JSON",
    value: { stringValue: JSON.stringify(value) },
  };
}

export async function execute(
  rdsClient: RDSDataClient,
  config: TrainingDataStoreConfig,
  sql: string,
  parameters: SqlParameter[] = [],
  transactionId?: string,
) {
  return rdsClient.send(
    new ExecuteStatementCommand({
      database: config.database,
      formatRecordsAs: "JSON",
      parameters,
      resourceArn: config.clusterArn,
      secretArn: config.secretArn,
      sql,
      transactionId,
    }),
  );
}

export function parseRows<T>(result: { formattedRecords?: string }): T[] {
  if (!result.formattedRecords) {
    return [];
  }
  const parsed: unknown = JSON.parse(result.formattedRecords);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

/**
 * `formatRecordsAs: "JSON"` が jsonb/json 列をネイティブ JSON として埋め込むか、文字列として
 * 返すかを実際の RDS Data API 呼び出しで検証できていないため、両方の形を許容する。
 */
export function parseJsonColumn<T>(value: T | string, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value ?? fallback;
}

export async function beginTransaction(
  rdsClient: RDSDataClient,
  config: TrainingDataStoreConfig,
): Promise<string> {
  const begin = await rdsClient.send(
    new BeginTransactionCommand({
      database: config.database,
      resourceArn: config.clusterArn,
      secretArn: config.secretArn,
    }),
  );
  const transactionId = begin.transactionId;
  if (!transactionId) {
    throw new Error("failed to begin transaction");
  }
  return transactionId;
}

export async function commitTransaction(
  rdsClient: RDSDataClient,
  config: TrainingDataStoreConfig,
  transactionId: string,
): Promise<void> {
  await rdsClient.send(
    new CommitTransactionCommand({
      resourceArn: config.clusterArn,
      secretArn: config.secretArn,
      transactionId,
    }),
  );
}

export async function rollbackTransaction(
  rdsClient: RDSDataClient,
  config: TrainingDataStoreConfig,
  transactionId: string,
): Promise<void> {
  await rdsClient
    .send(
      new RollbackTransactionCommand({
        resourceArn: config.clusterArn,
        secretArn: config.secretArn,
        transactionId,
      }),
    )
    .catch(() => {});
}

/**
 * JWT `sub`（uuid 形式）を `app_users` に upsert する。`display_name` は分かっているときだけ
 * 上書きする（`coalesce` で既存値を保持する）。
 */
export async function upsertAppUser(
  rdsClient: RDSDataClient,
  config: TrainingDataStoreConfig,
  input: { id: string; displayName?: string },
  transactionId: string,
): Promise<void> {
  await execute(
    rdsClient,
    config,
    `insert into app_users (id, display_name)
     values (:id::uuid, :displayName)
     on conflict (id) do update set
       display_name = coalesce(excluded.display_name, app_users.display_name),
       updated_at = now()`,
    [
      stringParam("id", input.id),
      nullableStringParam("displayName", input.displayName),
    ],
    transactionId,
  );
}
