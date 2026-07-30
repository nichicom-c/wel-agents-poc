import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";

import type {
  CreateSoapRecordVersionResult,
  SoapRecordItem,
  SoapRecordSummary,
  SoapRecordType,
  SoapRecordVersion,
  SoapRecordVersionSource,
} from "../contracts/soap-records.ts";

/**
 * SOAP Studio の「正式記録として保存」（issue #8 の前提）用の永続化層。Aurora Serverless v2
 * (PostgreSQL) を RDS Data API 経由で読み書きする（`terraform/aws/bff/training-data.tf` /
 * `terraform/aws/bff/migrations/0001_init.sql` 参照）。ORM は使わず、この repo の既存流儀
 * （`tools/db-migrate/run-migrations.ts` と同じ）で SQL を直接組み立てる。
 *
 * Postgres の enum 型（`soap_record_type` 等）はパラメータ化クエリでは自動キャストされない
 * ため、SQL 側で明示的に `::型名` キャストする。jsonb 列（`content`）は
 * `typeHint: "JSON"` で渡す。
 */

export type SoapRecordStoreConfig = {
  clusterArn: string;
  secretArn: string;
  database: string;
  region: string;
};

export type SoapRecordStoreDeps = {
  client?: RDSDataClient;
};

export type CreateSoapRecordVersionInput = {
  /** 既存記録に版を追記する場合に指定する（省略時は新規記録 + version 1 を作る）。 */
  recordId?: string;
  recordType: SoapRecordType;
  items: SoapRecordItem[];
  source: SoapRecordVersionSource;
  /** JWT `sub`（uuid 形式）。`app_users.id` の upsert にも使う。 */
  createdBy: string;
  createdByDisplayName?: string;
};

function resolveClient(
  config: SoapRecordStoreConfig,
  deps: SoapRecordStoreDeps,
): RDSDataClient {
  return deps.client ?? new RDSDataClient({ region: config.region });
}

function stringParam(name: string, value: string): SqlParameter {
  return { name, value: { stringValue: value } };
}

function nullableStringParam(
  name: string,
  value: string | undefined,
): SqlParameter {
  return value ? stringParam(name, value) : { name, value: { isNull: true } };
}

function jsonParam(name: string, value: unknown): SqlParameter {
  return {
    name,
    typeHint: "JSON",
    value: { stringValue: JSON.stringify(value) },
  };
}

async function execute(
  rdsClient: RDSDataClient,
  config: SoapRecordStoreConfig,
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

function parseRows<T>(result: { formattedRecords?: string }): T[] {
  if (!result.formattedRecords) {
    return [];
  }
  const parsed: unknown = JSON.parse(result.formattedRecords);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

async function upsertAppUser(
  rdsClient: RDSDataClient,
  config: SoapRecordStoreConfig,
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

async function createRecord(
  rdsClient: RDSDataClient,
  config: SoapRecordStoreConfig,
  input: CreateSoapRecordVersionInput,
  transactionId: string,
): Promise<string> {
  const rows = parseRows<{ id: string }>(
    await execute(
      rdsClient,
      config,
      `insert into soap_records (record_type, status, created_by)
       values (:recordType::soap_record_type, 'finalized'::soap_record_status, :createdBy::uuid)
       returning id`,
      [
        stringParam("recordType", input.recordType),
        stringParam("createdBy", input.createdBy),
      ],
      transactionId,
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error("failed to create soap_record");
  }
  return row.id;
}

async function nextVersionNo(
  rdsClient: RDSDataClient,
  config: SoapRecordStoreConfig,
  recordId: string,
  transactionId: string,
): Promise<number> {
  const rows = parseRows<{ next_version_no: number }>(
    await execute(
      rdsClient,
      config,
      `select coalesce(max(version_no), 0) + 1 as next_version_no
       from soap_record_versions where record_id = :recordId::uuid`,
      [stringParam("recordId", recordId)],
      transactionId,
    ),
  );
  return rows[0]?.next_version_no ?? 1;
}

/**
 * `recordId` 省略時は新規記録（status: finalized）+ version 1 を作る。指定時は既存記録に
 * version を追記する（存在しない recordId を渡すと外部キー制約違反で失敗する）。
 */
export async function createSoapRecordVersion(
  config: SoapRecordStoreConfig,
  input: CreateSoapRecordVersionInput,
  deps: SoapRecordStoreDeps = {},
): Promise<CreateSoapRecordVersionResult> {
  const rdsClient = resolveClient(config, deps);
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

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.createdByDisplayName, id: input.createdBy },
      transactionId,
    );

    const recordId =
      input.recordId ??
      (await createRecord(rdsClient, config, input, transactionId));
    const versionNo = await nextVersionNo(
      rdsClient,
      config,
      recordId,
      transactionId,
    );

    const versionRows = parseRows<{ id: string }>(
      await execute(
        rdsClient,
        config,
        `insert into soap_record_versions (record_id, version_no, content, source, created_by)
         values (:recordId::uuid, :versionNo, :content, :source::soap_record_version_source, :createdBy::uuid)
         returning id`,
        [
          stringParam("recordId", recordId),
          { name: "versionNo", value: { longValue: versionNo } },
          jsonParam("content", input.items),
          stringParam("source", input.source),
          stringParam("createdBy", input.createdBy),
        ],
        transactionId,
      ),
    );
    const versionRow = versionRows[0];
    if (!versionRow) {
      throw new Error("failed to create soap_record_version");
    }

    await rdsClient.send(
      new CommitTransactionCommand({
        resourceArn: config.clusterArn,
        secretArn: config.secretArn,
        transactionId,
      }),
    );

    return { recordId, versionId: versionRow.id, versionNo };
  } catch (error) {
    await rdsClient
      .send(
        new RollbackTransactionCommand({
          resourceArn: config.clusterArn,
          secretArn: config.secretArn,
          transactionId,
        }),
      )
      .catch(() => {});
    throw error;
  }
}

export async function listSoapRecords(
  config: SoapRecordStoreConfig,
  deps: SoapRecordStoreDeps = {},
): Promise<SoapRecordSummary[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<{
    id: string;
    record_type: SoapRecordType;
    status: "draft" | "finalized";
    created_by: string;
    created_at: string;
  }>(
    await execute(
      rdsClient,
      config,
      `select id, record_type, status, created_by, created_at
       from soap_records order by created_at desc`,
    ),
  );
  return rows.map((row) => ({
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    recordType: row.record_type,
    status: row.status,
  }));
}

export async function listSoapRecordVersions(
  config: SoapRecordStoreConfig,
  input: { recordId: string },
  deps: SoapRecordStoreDeps = {},
): Promise<SoapRecordVersion[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<{
    id: string;
    record_id: string;
    version_no: number;
    content: SoapRecordItem[] | string;
    source: SoapRecordVersionSource;
    created_by: string;
    created_at: string;
  }>(
    await execute(
      rdsClient,
      config,
      `select id, record_id, version_no, content, source, created_by, created_at
       from soap_record_versions where record_id = :recordId::uuid order by version_no asc`,
      [stringParam("recordId", input.recordId)],
    ),
  );
  return rows.map((row) => ({
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    items: parseContentItems(row.content),
    recordId: row.record_id,
    source: row.source,
    versionNo: row.version_no,
  }));
}

/**
 * `formatRecordsAs: "JSON"` が jsonb 列をネイティブ JSON として埋め込むか、文字列として
 * 返すかを実際の RDS Data API 呼び出しで検証できていないため、両方の形を許容する。
 */
function parseContentItems(value: SoapRecordItem[] | string): SoapRecordItem[] {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as SoapRecordItem[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}
