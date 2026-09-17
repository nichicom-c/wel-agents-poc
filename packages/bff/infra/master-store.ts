import type {
  MasterOption,
  Masters,
  RejectionReasonOption,
} from "../contracts/masters.ts";
import {
  execute,
  parseRows,
  resolveClient,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
} from "./training-data-sql.ts";

/**
 * issue #10 のマスタ（specialties / learning_themes / difficulty_levels /
 * rejection_reason_codes）の読み取り専用永続化層。増減の UI はまだ無い（初期値は
 * `0002_seed_masters.sql`）ため read のみ提供する。
 *
 * 並び順は画面の select の並びになる。難易度だけは `order_no` という明示的な並び（初級→上級）を
 * 持つのでそれに従い、他は id 順に固定して表示が揺れないようにする。
 */

type MasterOptionRow = {
  id: string;
  label: string;
};

type RejectionReasonRow = {
  code: string;
  label: string;
};

export async function getMasters(
  config: TrainingDataStoreConfig,
  deps: TrainingDataStoreDeps = {},
): Promise<Masters> {
  const rdsClient = resolveClient(config, deps);

  const [specialties, learningThemes, difficultyLevels, rejectionReasonCodes] =
    await Promise.all([
      listOptions(rdsClient, config, "select id, label from specialties"),
      listOptions(rdsClient, config, "select id, label from learning_themes"),
      listOptions(
        rdsClient,
        config,
        "select id, label from difficulty_levels order by order_no asc",
      ),
      listRejectionReasonCodes(rdsClient, config),
    ]);

  return {
    difficultyLevels,
    learningThemes,
    rejectionReasonCodes,
    specialties,
  };
}

async function listOptions(
  rdsClient: ReturnType<typeof resolveClient>,
  config: TrainingDataStoreConfig,
  sql: string,
): Promise<MasterOption[]> {
  const orderedSql = sql.includes("order by") ? sql : `${sql} order by id asc`;
  const rows = parseRows<MasterOptionRow>(
    await execute(rdsClient, config, orderedSql),
  );
  return rows.map((row) => ({ id: row.id, label: row.label }));
}

async function listRejectionReasonCodes(
  rdsClient: ReturnType<typeof resolveClient>,
  config: TrainingDataStoreConfig,
): Promise<RejectionReasonOption[]> {
  const rows = parseRows<RejectionReasonRow>(
    await execute(
      rdsClient,
      config,
      "select code, label from rejection_reason_codes order by code asc",
    ),
  );
  return rows.map((row) => ({ code: row.code, label: row.label }));
}
