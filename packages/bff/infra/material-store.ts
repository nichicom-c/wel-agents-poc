import type { RDSDataClient } from "@aws-sdk/client-rds-data";

import type {
  Material,
  MaterialFilters,
  MaterialRevision,
  MaterialType,
  PublicationStatus,
} from "../contracts/admin.ts";
import {
  beginTransaction,
  commitTransaction,
  execute,
  nullableStringParam,
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
 * 教材（issue #10）の永続化層。`materials` を主に、公開状態の変更履歴
 * （`material_revisions`）を `json_agg` で1回の select に埋め込んで返す。
 */

type RawRevision = Omit<MaterialRevision, "fromStatus"> & {
  fromStatus: PublicationStatus | null;
};

type MaterialRow = {
  id: string;
  material_type: MaterialType;
  title: string;
  publication_status: PublicationStatus;
  specialty_id: string | null;
  learning_theme_id: string | null;
  difficulty_id: string | null;
  created_by: string;
  created_at: string;
  revisions: RawRevision[] | string;
};

const MATERIAL_SELECT = `
  select m.id, m.material_type, m.title, m.publication_status, m.specialty_id,
         m.learning_theme_id, m.difficulty_id, m.created_by, m.created_at,
         coalesce((
           select json_agg(json_build_object(
             'fromStatus', mr.from_status,
             'toStatus', mr.to_status,
             'changedBy', mr.changed_by,
             'changedAt', mr.changed_at
           ) order by mr.changed_at)
           from material_revisions mr
           where mr.material_id = m.id
         ), '[]'::json) as revisions
  from materials m
`;

function mapMaterialRow(row: MaterialRow): Material {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    difficultyId: row.difficulty_id ?? undefined,
    id: row.id,
    learningThemeId: row.learning_theme_id ?? undefined,
    materialType: row.material_type,
    publicationStatus: row.publication_status,
    revisions: parseJsonColumn<RawRevision[]>(row.revisions, []),
    specialtyId: row.specialty_id ?? undefined,
    title: row.title,
  };
}

async function fetchMaterialById(
  rdsClient: RDSDataClient,
  config: TrainingDataStoreConfig,
  id: string,
  transactionId?: string,
): Promise<Material> {
  const rows = parseRows<MaterialRow>(
    await execute(
      rdsClient,
      config,
      `${MATERIAL_SELECT} where m.id = :id::uuid`,
      [stringParam("id", id)],
      transactionId,
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`material not found: ${id}`);
  }
  return mapMaterialRow(row);
}

export async function listMaterials(
  config: TrainingDataStoreConfig,
  filters: MaterialFilters = {},
  deps: TrainingDataStoreDeps = {},
): Promise<Material[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<MaterialRow>(
    await execute(
      rdsClient,
      config,
      `${MATERIAL_SELECT}
       where (:materialType::material_type is null or m.material_type = :materialType::material_type)
         and (:publicationStatus::publication_status is null or m.publication_status = :publicationStatus::publication_status)
       order by m.created_at desc`,
      [
        nullableStringParam("materialType", filters.materialType),
        nullableStringParam("publicationStatus", filters.publicationStatus),
      ],
    ),
  );
  return rows.map(mapMaterialRow);
}

export type CreateMaterialInput = {
  materialType: MaterialType;
  title: string;
  specialtyId?: string;
  learningThemeId?: string;
  difficultyId?: string;
  createdBy: string;
  createdByDisplayName?: string;
};

/** 新規教材を status: draft で作る（issue #8 の教材候補承認や手動登録の受け口）。 */
export async function createMaterial(
  config: TrainingDataStoreConfig,
  input: CreateMaterialInput,
  deps: TrainingDataStoreDeps = {},
): Promise<Material> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.createdByDisplayName, id: input.createdBy },
      transactionId,
    );

    const rows = parseRows<{ id: string }>(
      await execute(
        rdsClient,
        config,
        `insert into materials
           (material_type, title, publication_status, specialty_id, learning_theme_id,
            difficulty_id, created_by)
         values
           (:materialType::material_type, :title, 'draft'::publication_status, :specialtyId,
            :learningThemeId, :difficultyId, :createdBy::uuid)
         returning id`,
        [
          stringParam("materialType", input.materialType),
          stringParam("title", input.title),
          nullableStringParam("specialtyId", input.specialtyId),
          nullableStringParam("learningThemeId", input.learningThemeId),
          nullableStringParam("difficultyId", input.difficultyId),
          stringParam("createdBy", input.createdBy),
        ],
        transactionId,
      ),
    );
    const row = rows[0];
    if (!row) {
      throw new Error("failed to create material");
    }
    const materialId = row.id;

    await execute(
      rdsClient,
      config,
      `insert into material_revisions (material_id, from_status, to_status, changed_by)
       values (:materialId::uuid, null::publication_status, 'draft'::publication_status, :changedBy::uuid)`,
      [
        stringParam("materialId", materialId),
        stringParam("changedBy", input.createdBy),
      ],
      transactionId,
    );

    const created = await fetchMaterialById(
      rdsClient,
      config,
      materialId,
      transactionId,
    );

    await commitTransaction(rdsClient, config, transactionId);

    return created;
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}

export type ChangeMaterialStatusInput = {
  id: string;
  nextStatus: PublicationStatus;
  changedBy: string;
  changedByDisplayName?: string;
};

/** 公開状態を明示的な state として管理する（issue #10 の Technical Approach）。 */
export async function changeMaterialStatus(
  config: TrainingDataStoreConfig,
  input: ChangeMaterialStatusInput,
  deps: TrainingDataStoreDeps = {},
): Promise<Material> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.changedByDisplayName, id: input.changedBy },
      transactionId,
    );

    const currentRows = parseRows<{ publication_status: PublicationStatus }>(
      await execute(
        rdsClient,
        config,
        `select publication_status from materials where id = :id::uuid`,
        [stringParam("id", input.id)],
        transactionId,
      ),
    );
    const current = currentRows[0];
    if (!current) {
      throw new Error(`material not found: ${input.id}`);
    }

    await execute(
      rdsClient,
      config,
      `update materials
       set publication_status = :nextStatus::publication_status, updated_at = now()
       where id = :id::uuid`,
      [
        stringParam("id", input.id),
        stringParam("nextStatus", input.nextStatus),
      ],
      transactionId,
    );

    await execute(
      rdsClient,
      config,
      `insert into material_revisions (material_id, from_status, to_status, changed_by)
       values (:id::uuid, :fromStatus::publication_status, :nextStatus::publication_status, :changedBy::uuid)`,
      [
        stringParam("id", input.id),
        stringParam("fromStatus", current.publication_status),
        stringParam("nextStatus", input.nextStatus),
        stringParam("changedBy", input.changedBy),
      ],
      transactionId,
    );

    const updated = await fetchMaterialById(
      rdsClient,
      config,
      input.id,
      transactionId,
    );

    await commitTransaction(rdsClient, config, transactionId);

    return updated;
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}
