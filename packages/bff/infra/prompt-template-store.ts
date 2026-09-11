import type {
  CreatePromptTemplateInput,
  PromptTemplate,
} from "../contracts/prompt-template.ts";
import {
  execute,
  jsonParam,
  nullableStringParam,
  parseJsonColumn,
  parseRows,
  resolveClient,
  stringParam,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
} from "./training-data-sql.ts";

/**
 * 保健師SOAP_KB_詳細設計書_v2 の prompt_template の永続化層。
 * 今回は Admin での一覧・作成のみを提供する（AgentCore 実行時には未接続）。
 */

type PromptTemplateRow = {
  id: string;
  knowledge_base_id: string;
  code: string;
  name: string;
  system_prompt: string;
  user_prompt_template: string;
  output_schema: Record<string, unknown> | string;
  version: string;
  is_active: boolean;
  created_at: string;
};

function mapPromptTemplateRow(row: PromptTemplateRow): PromptTemplate {
  return {
    code: row.code,
    createdAt: row.created_at,
    id: row.id,
    isActive: row.is_active,
    knowledgeBaseId: row.knowledge_base_id,
    name: row.name,
    outputSchema: parseJsonColumn<Record<string, unknown>>(
      row.output_schema,
      {},
    ),
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template,
    version: row.version,
  };
}

export async function listPromptTemplates(
  config: TrainingDataStoreConfig,
  deps: TrainingDataStoreDeps = {},
): Promise<PromptTemplate[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<PromptTemplateRow>(
    await execute(
      rdsClient,
      config,
      `select id, knowledge_base_id, code, name, system_prompt, user_prompt_template,
              output_schema, version, is_active, created_at
       from prompt_template
       order by created_at desc`,
    ),
  );
  return rows.map(mapPromptTemplateRow);
}

export async function createPromptTemplate(
  config: TrainingDataStoreConfig,
  input: CreatePromptTemplateInput,
  deps: TrainingDataStoreDeps = {},
): Promise<PromptTemplate> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<PromptTemplateRow>(
    await execute(
      rdsClient,
      config,
      `insert into prompt_template
         (knowledge_base_id, code, name, system_prompt, user_prompt_template, output_schema, version)
       values
         (:knowledgeBaseId::uuid, :code, :name, :systemPrompt, :userPromptTemplate,
          coalesce(:outputSchema, '{}'::jsonb), coalesce(:version, '1.0'))
       returning id, knowledge_base_id, code, name, system_prompt, user_prompt_template,
                 output_schema, version, is_active, created_at`,
      [
        stringParam("knowledgeBaseId", input.knowledgeBaseId),
        stringParam("code", input.code),
        stringParam("name", input.name),
        stringParam("systemPrompt", input.systemPrompt),
        stringParam("userPromptTemplate", input.userPromptTemplate),
        jsonParam("outputSchema", input.outputSchema ?? {}),
        nullableStringParam("version", input.version),
      ],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error("failed to create prompt template");
  }
  return mapPromptTemplateRow(row);
}
