import type {
  RequiredItemFilters,
  RequiredRecommendedItem,
  RequirementLevel,
} from "../contracts/admin.ts";
import type { SoapRecordType } from "../contracts/soap-records.ts";
import {
  execute,
  nullableStringParam,
  parseRows,
  resolveClient,
  stringParam,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
} from "./training-data-sql.ts";

/** 必須・推奨項目（issue #10）の永続化層。`required_recommended_items` を読み書きする。 */

type RequiredItemRow = {
  id: string;
  record_type: SoapRecordType;
  specialty_id: string | null;
  item_name: string;
  requirement_level: RequirementLevel;
  aggregation_category: string;
};

function mapRow(row: RequiredItemRow): RequiredRecommendedItem {
  return {
    aggregationCategory: row.aggregation_category,
    id: row.id,
    itemName: row.item_name,
    recordType: row.record_type,
    requirementLevel: row.requirement_level,
    specialtyId: row.specialty_id ?? undefined,
  };
}

export async function listRequiredItems(
  config: TrainingDataStoreConfig,
  filters: RequiredItemFilters = {},
  deps: TrainingDataStoreDeps = {},
): Promise<RequiredRecommendedItem[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<RequiredItemRow>(
    await execute(
      rdsClient,
      config,
      `select id, record_type, specialty_id, item_name, requirement_level, aggregation_category
       from required_recommended_items
       where (:recordType::soap_record_type is null or record_type = :recordType::soap_record_type)
         and (:specialtyId::text is null or specialty_id = :specialtyId::text)
       order by effective_from desc`,
      [
        nullableStringParam("recordType", filters.recordType),
        nullableStringParam("specialtyId", filters.specialtyId),
      ],
    ),
  );
  return rows.map(mapRow);
}

export type CreateRequiredItemInput = {
  recordType: SoapRecordType;
  specialtyId?: string;
  itemName: string;
  requirementLevel: RequirementLevel;
  aggregationCategory: string;
};

export async function createRequiredItem(
  config: TrainingDataStoreConfig,
  input: CreateRequiredItemInput,
  deps: TrainingDataStoreDeps = {},
): Promise<RequiredRecommendedItem> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<RequiredItemRow>(
    await execute(
      rdsClient,
      config,
      `insert into required_recommended_items
         (record_type, specialty_id, item_name, requirement_level, aggregation_category)
       values
         (:recordType::soap_record_type, :specialtyId, :itemName,
          :requirementLevel::requirement_level, :aggregationCategory)
       returning id, record_type, specialty_id, item_name, requirement_level, aggregation_category`,
      [
        stringParam("recordType", input.recordType),
        nullableStringParam("specialtyId", input.specialtyId),
        stringParam("itemName", input.itemName),
        stringParam("requirementLevel", input.requirementLevel),
        stringParam("aggregationCategory", input.aggregationCategory),
      ],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error("failed to create required_recommended_item");
  }
  return mapRow(row);
}
