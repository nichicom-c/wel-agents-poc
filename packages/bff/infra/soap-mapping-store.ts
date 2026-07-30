import type {
  MappingDefinition,
  SoapMappingVersion,
} from "../contracts/admin.ts";
import type { SoapRecordType } from "../contracts/soap-records.ts";
import {
  beginTransaction,
  commitTransaction,
  execute,
  jsonParam,
  parseJsonColumn,
  parseRows,
  resolveClient,
  rollbackTransaction,
  stringParam,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
  upsertAppUser,
} from "./training-data-sql.ts";

/**
 * SOAP マッピング（issue #10）の永続化層。`soap_mapping_versions` を記録種別ごとにバージョン
 * 管理する。「変更は既存記録へ即時反映せず、新規解析から適用する」（issue #10 の Technical
 * Approach）ため、既存の版を書き換えることはせず、新規バージョンを追加して同じ記録種別の
 * 他バージョンの `is_current` を落とす。
 */

type MappingVersionRow = {
  id: string;
  record_type: SoapRecordType;
  version_no: number;
  mapping_definition: MappingDefinition | string;
  is_current: boolean;
  effective_from: string;
  created_by: string;
};

function mapVersionRow(row: MappingVersionRow): SoapMappingVersion {
  return {
    createdBy: row.created_by,
    effectiveFrom: row.effective_from,
    id: row.id,
    isCurrent: row.is_current,
    mappingDefinition: parseJsonColumn<MappingDefinition>(
      row.mapping_definition,
      { A: "", O: "", P: "", S: "" },
    ),
    recordType: row.record_type,
    versionNo: row.version_no,
  };
}

export async function listSoapMappingVersions(
  config: TrainingDataStoreConfig,
  input: { recordType: SoapRecordType },
  deps: TrainingDataStoreDeps = {},
): Promise<SoapMappingVersion[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<MappingVersionRow>(
    await execute(
      rdsClient,
      config,
      `select id, record_type, version_no, mapping_definition, is_current, effective_from, created_by
       from soap_mapping_versions
       where record_type = :recordType::soap_record_type
       order by version_no asc`,
      [stringParam("recordType", input.recordType)],
    ),
  );
  return rows.map(mapVersionRow);
}

export type CreateSoapMappingVersionInput = {
  recordType: SoapRecordType;
  mappingDefinition: MappingDefinition;
  createdBy: string;
  createdByDisplayName?: string;
};

/** 新規バージョンを作り、同じ記録種別の既存バージョンの `is_current` を落とす。 */
export async function createSoapMappingVersion(
  config: TrainingDataStoreConfig,
  input: CreateSoapMappingVersionInput,
  deps: TrainingDataStoreDeps = {},
): Promise<SoapMappingVersion[]> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.createdByDisplayName, id: input.createdBy },
      transactionId,
    );

    await execute(
      rdsClient,
      config,
      `update soap_mapping_versions
       set is_current = false
       where record_type = :recordType::soap_record_type and is_current`,
      [stringParam("recordType", input.recordType)],
      transactionId,
    );

    const nextVersionRows = parseRows<{ next_version_no: number }>(
      await execute(
        rdsClient,
        config,
        `select coalesce(max(version_no), 0) + 1 as next_version_no
         from soap_mapping_versions where record_type = :recordType::soap_record_type`,
        [stringParam("recordType", input.recordType)],
        transactionId,
      ),
    );
    const nextVersionNo = nextVersionRows[0]?.next_version_no ?? 1;

    await execute(
      rdsClient,
      config,
      `insert into soap_mapping_versions
         (record_type, version_no, mapping_definition, is_current, created_by)
       values
         (:recordType::soap_record_type, :versionNo, :mappingDefinition, true, :createdBy::uuid)`,
      [
        stringParam("recordType", input.recordType),
        { name: "versionNo", value: { longValue: nextVersionNo } },
        jsonParam("mappingDefinition", input.mappingDefinition),
        stringParam("createdBy", input.createdBy),
      ],
      transactionId,
    );

    await commitTransaction(rdsClient, config, transactionId);
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }

  return listSoapMappingVersions(
    config,
    { recordType: input.recordType },
    deps,
  );
}
