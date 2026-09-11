import type {
  CreateRubricInput,
  Rubric,
  RubricLevel,
} from "../contracts/rubric.ts";
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
} from "./training-data-sql.ts";

/**
 * 評価ルーブリック（保健師SOAP_KB_詳細設計書_v2 の rubric / rubric_level、8軸×4レベル）の
 * 永続化層。`rubric` を主に、レベル定義（`rubric_level`）を `json_agg` で1回の select に
 * 埋め込んで返す。旧 issue #10 ベースの `rubrics`/`rubric_items`（review_status による承認
 * フロー）を置き換える — 新スキーマには review_status に相当する列が無く、is_active のみ。
 */

type RubricRow = {
  id: string;
  knowledge_base_id: string;
  code: string;
  name: string;
  objective: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  levels: RubricLevel[] | string;
};

const RUBRIC_SELECT = `
  select r.id, r.knowledge_base_id, r.code, r.name, r.objective, r.sort_order, r.is_active, r.created_at,
         coalesce((
           select json_agg(json_build_object(
             'level', rl.level,
             'levelName', rl.level_name,
             'definition', rl.definition,
             'criteria', rl.criteria
           ) order by rl.level)
           from rubric_level rl
           where rl.rubric_id = r.id
         ), '[]'::json) as levels
  from rubric r
`;

function mapRubricRow(row: RubricRow): Rubric {
  return {
    code: row.code,
    createdAt: row.created_at,
    id: row.id,
    isActive: row.is_active,
    knowledgeBaseId: row.knowledge_base_id,
    levels: parseJsonColumn<RubricLevel[]>(row.levels, []),
    name: row.name,
    objective: row.objective,
    sortOrder: row.sort_order,
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
      `${RUBRIC_SELECT} order by r.sort_order, r.created_at`,
    ),
  );
  return rows.map(mapRubricRow);
}

export async function createRubric(
  config: TrainingDataStoreConfig,
  input: CreateRubricInput,
  deps: TrainingDataStoreDeps = {},
): Promise<Rubric> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    const rubricRows = parseRows<{ id: string }>(
      await execute(
        rdsClient,
        config,
        `insert into rubric (knowledge_base_id, code, name, objective, sort_order)
         values (:knowledgeBaseId::uuid, :code, :name, :objective, coalesce(:sortOrder, 0))
         returning id`,
        [
          stringParam("knowledgeBaseId", input.knowledgeBaseId),
          stringParam("code", input.code),
          stringParam("name", input.name),
          stringParam("objective", input.objective),
          ...(input.sortOrder === undefined
            ? [{ name: "sortOrder", value: { isNull: true } }]
            : [stringParam("sortOrder", String(input.sortOrder))]),
        ],
        transactionId,
      ),
    );
    const rubricId = rubricRows[0]?.id;
    if (!rubricId) {
      throw new Error("failed to create rubric");
    }

    for (const level of input.levels) {
      await execute(
        rdsClient,
        config,
        `insert into rubric_level (rubric_id, level, level_name, definition, criteria)
         values (:rubricId::uuid, :level::integer, :levelName, :definition, :criteria)`,
        [
          stringParam("rubricId", rubricId),
          stringParam("level", String(level.level)),
          stringParam("levelName", level.levelName),
          stringParam("definition", level.definition),
          jsonParam("criteria", level.criteria ?? []),
        ],
        transactionId,
      );
    }

    await commitTransaction(rdsClient, config, transactionId);

    return await fetchRubricById(config, rubricId, deps);
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}

export async function setRubricActive(
  config: TrainingDataStoreConfig,
  input: { id: string; isActive: boolean },
  deps: TrainingDataStoreDeps = {},
): Promise<Rubric> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<{ id: string }>(
    await execute(
      rdsClient,
      config,
      `update rubric set is_active = :isActive::boolean, updated_at = now()
       where id = :id::uuid
       returning id`,
      [
        stringParam("id", input.id),
        stringParam("isActive", String(input.isActive)),
      ],
    ),
  );
  if (!rows[0]) {
    throw new Error(`rubric not found: ${input.id}`);
  }
  return fetchRubricById(config, input.id, deps);
}
