import type {
  ReferenceKnowledge,
  ReferenceKnowledgeSourceType,
} from "../contracts/admin.ts";
import {
  execute,
  parseJsonColumn,
  parseRows,
  resolveClient,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
} from "./training-data-sql.ts";

/**
 * 参照知識（issue #10）の読み取り専用永続化層。`externalKbRef` は既存の vector Knowledge
 * Base（law / medical_care_law）上のドキュメントへの参照であり、内容をこのテーブルへ複製
 * しない。作成/更新 UI はまだ無い（issue #10 の Out of Scope）ため read のみ提供する。
 */

type ReferenceKnowledgeRow = {
  id: string;
  title: string;
  summary: string;
  source_type: ReferenceKnowledgeSourceType;
  external_kb_ref: string | null;
  linked_material_ids: string[] | string;
  linked_rubric_ids: string[] | string;
};

export async function listReferenceKnowledge(
  config: TrainingDataStoreConfig,
  deps: TrainingDataStoreDeps = {},
): Promise<ReferenceKnowledge[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<ReferenceKnowledgeRow>(
    await execute(
      rdsClient,
      config,
      `select rk.id, rk.title, rk.summary, rk.source_type, rk.external_kb_ref,
              coalesce((
                select json_agg(mrk.material_id)
                from material_reference_knowledge mrk
                where mrk.reference_knowledge_id = rk.id
              ), '[]'::json) as linked_material_ids,
              coalesce((
                select json_agg(rrk.rubric_id)
                from rubric_reference_knowledge rrk
                where rrk.reference_knowledge_id = rk.id
              ), '[]'::json) as linked_rubric_ids
       from reference_knowledge rk
       order by rk.title asc`,
    ),
  );
  return rows.map((row) => ({
    externalKbRef: row.external_kb_ref ?? undefined,
    id: row.id,
    linkedMaterialIds: parseJsonColumn<string[]>(row.linked_material_ids, []),
    linkedRubricIds: parseJsonColumn<string[]>(row.linked_rubric_ids, []),
    sourceType: row.source_type,
    summary: row.summary,
    title: row.title,
  }));
}
