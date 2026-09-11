import type {
  CreateSoapKnowledgeBaseInput,
  CreateSoapKnowledgeItemInput,
  KnowledgeBaseStatus,
  KnowledgeItemCategory,
  SoapKnowledgeBase,
  SoapKnowledgeItem,
} from "../contracts/soap-knowledge-base.ts";
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
 * 保健師SOAP_KB_詳細設計書_v2 の固定 Knowledge Base（knowledge_base / knowledge_item）の永続化層。
 * 著者情報（created_by 等）は設計書のスキーマ上持たないため扱わない。
 */

type KnowledgeBaseRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  version: string;
  status: KnowledgeBaseStatus;
  created_at: string;
  updated_at: string;
};

function mapKnowledgeBaseRow(row: KnowledgeBaseRow): SoapKnowledgeBase {
  return {
    code: row.code,
    createdAt: row.created_at,
    description: row.description ?? undefined,
    id: row.id,
    name: row.name,
    status: row.status,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export async function listKnowledgeBases(
  config: TrainingDataStoreConfig,
  deps: TrainingDataStoreDeps = {},
): Promise<SoapKnowledgeBase[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<KnowledgeBaseRow>(
    await execute(
      rdsClient,
      config,
      `select id, code, name, description, version, status, created_at, updated_at
       from knowledge_base
       order by created_at desc`,
    ),
  );
  return rows.map(mapKnowledgeBaseRow);
}

export async function createKnowledgeBase(
  config: TrainingDataStoreConfig,
  input: CreateSoapKnowledgeBaseInput,
  deps: TrainingDataStoreDeps = {},
): Promise<SoapKnowledgeBase> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<KnowledgeBaseRow>(
    await execute(
      rdsClient,
      config,
      `insert into knowledge_base (code, name, description, version, status)
       values (:code, :name, :description, :version, coalesce(:status, 'draft'))
       returning id, code, name, description, version, status, created_at, updated_at`,
      [
        stringParam("code", input.code),
        stringParam("name", input.name),
        nullableStringParam("description", input.description),
        stringParam("version", input.version),
        nullableStringParam("status", input.status),
      ],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error("failed to create knowledge base");
  }
  return mapKnowledgeBaseRow(row);
}

export async function setKnowledgeBaseStatus(
  config: TrainingDataStoreConfig,
  input: { id: string; status: KnowledgeBaseStatus },
  deps: TrainingDataStoreDeps = {},
): Promise<SoapKnowledgeBase> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<KnowledgeBaseRow>(
    await execute(
      rdsClient,
      config,
      `update knowledge_base set status = :status, updated_at = now()
       where id = :id::uuid
       returning id, code, name, description, version, status, created_at, updated_at`,
      [stringParam("id", input.id), stringParam("status", input.status)],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`knowledge base not found: ${input.id}`);
  }
  return mapKnowledgeBaseRow(row);
}

type KnowledgeItemRow = {
  id: string;
  knowledge_base_id: string;
  category: KnowledgeItemCategory;
  item_key: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | string;
  version: string;
  is_active: boolean;
  created_at: string;
};

function mapKnowledgeItemRow(row: KnowledgeItemRow): SoapKnowledgeItem {
  return {
    category: row.category,
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    isActive: row.is_active,
    itemKey: row.item_key,
    knowledgeBaseId: row.knowledge_base_id,
    metadata: parseJsonColumn<Record<string, unknown>>(row.metadata, {}),
    title: row.title,
    version: row.version,
  };
}

export async function listKnowledgeItems(
  config: TrainingDataStoreConfig,
  filters: { knowledgeBaseId: string },
  deps: TrainingDataStoreDeps = {},
): Promise<SoapKnowledgeItem[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<KnowledgeItemRow>(
    await execute(
      rdsClient,
      config,
      `select id, knowledge_base_id, category, item_key, title, content, metadata, version, is_active, created_at
       from knowledge_item
       where knowledge_base_id = :knowledgeBaseId::uuid
       order by category, item_key`,
      [stringParam("knowledgeBaseId", filters.knowledgeBaseId)],
    ),
  );
  return rows.map(mapKnowledgeItemRow);
}

export async function createKnowledgeItem(
  config: TrainingDataStoreConfig,
  input: CreateSoapKnowledgeItemInput,
  deps: TrainingDataStoreDeps = {},
): Promise<SoapKnowledgeItem> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<KnowledgeItemRow>(
    await execute(
      rdsClient,
      config,
      `insert into knowledge_item (knowledge_base_id, category, item_key, title, content, metadata, version)
       values (:knowledgeBaseId::uuid, :category, :itemKey, :title, :content, coalesce(:metadata, '{}'::jsonb), coalesce(:version, '1.0'))
       returning id, knowledge_base_id, category, item_key, title, content, metadata, version, is_active, created_at`,
      [
        stringParam("knowledgeBaseId", input.knowledgeBaseId),
        stringParam("category", input.category),
        stringParam("itemKey", input.itemKey),
        stringParam("title", input.title),
        stringParam("content", input.content),
        jsonParam("metadata", input.metadata ?? {}),
        nullableStringParam("version", input.version),
      ],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error("failed to create knowledge item");
  }
  return mapKnowledgeItemRow(row);
}

export async function setKnowledgeItemActive(
  config: TrainingDataStoreConfig,
  input: { id: string; isActive: boolean },
  deps: TrainingDataStoreDeps = {},
): Promise<SoapKnowledgeItem> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<KnowledgeItemRow>(
    await execute(
      rdsClient,
      config,
      `update knowledge_item set is_active = :isActive::boolean, updated_at = now()
       where id = :id::uuid
       returning id, knowledge_base_id, category, item_key, title, content, metadata, version, is_active, created_at`,
      [
        stringParam("id", input.id),
        stringParam("isActive", String(input.isActive)),
      ],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`knowledge item not found: ${input.id}`);
  }
  return mapKnowledgeItemRow(row);
}

/**
 * 設計書6.2節の KB 取得ルール: `knowledge_base.status = 'active'` の最新版を対象に、
 * 指定カテゴリの `is_active = true` の知識項目を返す。soap_draft / soap_gaps が
 * AgentCore へ渡す補足コンテキストの組み立てに使う。
 */
export async function getActiveKnowledgeItems(
  config: TrainingDataStoreConfig,
  categories: readonly KnowledgeItemCategory[],
  deps: TrainingDataStoreDeps = {},
): Promise<SoapKnowledgeItem[]> {
  if (categories.length === 0) {
    return [];
  }
  const rdsClient = resolveClient(config, deps);
  // Data API には配列パラメータの型が無いため、CSV文字列 + string_to_array で渡す
  // （category 値に "," を含まないため安全）。
  const rows = parseRows<KnowledgeItemRow>(
    await execute(
      rdsClient,
      config,
      `select ki.id, ki.knowledge_base_id, ki.category, ki.item_key, ki.title, ki.content,
              ki.metadata, ki.version, ki.is_active, ki.created_at
       from knowledge_item ki
       join knowledge_base kb on kb.id = ki.knowledge_base_id
       where kb.status = 'active'
         and ki.is_active = true
         and ki.category = any(string_to_array(:categoriesCsv, ','))
       order by kb.updated_at desc, ki.category, ki.item_key`,
      [stringParam("categoriesCsv", categories.join(","))],
    ),
  );
  return rows.map(mapKnowledgeItemRow);
}
