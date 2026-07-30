import type {
  Rubric,
  RubricItem,
  RubricReviewStatus,
  RubricTargetType,
} from "../contracts/admin.ts";
import {
  beginTransaction,
  commitTransaction,
  execute,
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
 * 評価ルーブリック（issue #10）の永続化層。`rubrics` を主に、評価項目（`rubric_items`）を
 * `json_agg` で1回の select に埋め込んで返す。`review_status`（有識者確認前 ⇄ 確認済み）の
 * 変更履歴は DB スキーマ上持たないため、単純な update のみで扱う
 * （issue #10 の Open Question「ルーブリック確定時の承認フロー」）。
 */

type RubricRow = {
  id: string;
  name: string;
  target_type: RubricTargetType;
  review_status: RubricReviewStatus;
  version_no: number;
  created_by: string;
  created_at: string;
  items: RubricItem[] | string;
};

const RUBRIC_SELECT = `
  select r.id, r.name, r.target_type, r.review_status, r.version_no, r.created_by, r.created_at,
         coalesce((
           select json_agg(json_build_object(
             'id', ri.id,
             'criterionName', ri.criterion_name,
             'description', ri.description
           ) order by ri.order_no)
           from rubric_items ri
           where ri.rubric_id = r.id
         ), '[]'::json) as items
  from rubrics r
`;

function mapRubricRow(row: RubricRow): Rubric {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    items: parseJsonColumn<RubricItem[]>(row.items, []),
    name: row.name,
    reviewStatus: row.review_status,
    targetType: row.target_type,
    versionNo: row.version_no,
  };
}

async function fetchRubricById(
  config: TrainingDataStoreConfig,
  id: string,
  deps: TrainingDataStoreDeps,
): Promise<Rubric> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<RubricRow>(
    await execute(
      rdsClient,
      config,
      `${RUBRIC_SELECT} where r.id = :id::uuid`,
      [stringParam("id", id)],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`rubric not found: ${id}`);
  }
  return mapRubricRow(row);
}

export async function listRubrics(
  config: TrainingDataStoreConfig,
  deps: TrainingDataStoreDeps = {},
): Promise<Rubric[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<RubricRow>(
    await execute(
      rdsClient,
      config,
      `${RUBRIC_SELECT} order by r.created_at desc`,
    ),
  );
  return rows.map(mapRubricRow);
}

export type CreateRubricInput = {
  name: string;
  targetType: RubricTargetType;
  createdBy: string;
  createdByDisplayName?: string;
};

export async function createRubric(
  config: TrainingDataStoreConfig,
  input: CreateRubricInput,
  deps: TrainingDataStoreDeps = {},
): Promise<Rubric> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.createdByDisplayName, id: input.createdBy },
      transactionId,
    );

    const rows = parseRows<RubricRow>(
      await execute(
        rdsClient,
        config,
        `insert into rubrics (name, target_type, review_status, version_no, created_by)
         values (:name, :targetType::rubric_target_type, 'expert_review_required'::rubric_review_status,
                 1, :createdBy::uuid)
         returning id, name, target_type, review_status, version_no, created_by, created_at,
                   '[]'::json as items`,
        [
          stringParam("name", input.name),
          stringParam("targetType", input.targetType),
          stringParam("createdBy", input.createdBy),
        ],
        transactionId,
      ),
    );
    const row = rows[0];
    if (!row) {
      throw new Error("failed to create rubric");
    }

    await commitTransaction(rdsClient, config, transactionId);

    return mapRubricRow(row);
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}

export async function setRubricReviewStatus(
  config: TrainingDataStoreConfig,
  input: { id: string; nextStatus: RubricReviewStatus },
  deps: TrainingDataStoreDeps = {},
): Promise<Rubric> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<{ id: string }>(
    await execute(
      rdsClient,
      config,
      `update rubrics set review_status = :nextStatus::rubric_review_status
       where id = :id::uuid
       returning id`,
      [
        stringParam("id", input.id),
        stringParam("nextStatus", input.nextStatus),
      ],
    ),
  );
  if (!rows[0]) {
    throw new Error(`rubric not found: ${input.id}`);
  }
  return fetchRubricById(config, input.id, deps);
}
