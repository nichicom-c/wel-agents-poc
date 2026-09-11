import {
  isSoapRecordType,
  type SoapRecordType,
} from "../../soap-draft/index.ts";
import {
  KNOWLEDGE_BASE_STATUSES,
  KNOWLEDGE_ITEM_CATEGORIES,
  type KnowledgeBaseStatus,
  type KnowledgeItemCategory,
  type SoapKnowledgeBase,
  type SoapKnowledgeItem,
} from "../model/knowledge-base.ts";
import {
  MATERIAL_TYPES,
  type Material,
  type MaterialFilters,
  type MaterialRevision,
  type MaterialType,
  PUBLICATION_STATUSES,
  type PublicationStatus,
} from "../model/materials.ts";
import type { PromptTemplate } from "../model/prompt-templates.ts";
import type { QualityMetricDefinition } from "../model/quality-metrics.ts";
import type {
  ReferenceKnowledge,
  ReferenceKnowledgeSourceType,
} from "../model/reference-knowledge.ts";
import { REFERENCE_KNOWLEDGE_SOURCE_TYPES } from "../model/reference-knowledge.ts";
import {
  REQUIREMENT_LEVELS,
  type RequiredItemFilters,
  type RequiredRecommendedItem,
  type RequirementLevel,
} from "../model/required-items.ts";
import {
  isRubricLevelNumber,
  type Rubric,
  type RubricLevel,
} from "../model/rubrics.ts";
import {
  MAPPING_CATEGORIES,
  type MappingDefinition,
  type SoapMappingVersion,
} from "../model/soap-mapping.ts";

/**
 * 管理画面が使う BFF `/api/materials*` / `/api/rubrics*` / `/api/soap-knowledge-base*` /
 * `/api/prompt-templates` / `/api/reference-knowledge` / `/api/soap-mapping-versions` /
 * `/api/required-items` / `/api/quality-metrics`（Aurora Serverless v2 + RDS Data API）を
 * 呼ぶ。ルーブリック・Knowledge Base・Prompt Template は保健師SOAP_KB_詳細設計書_v2 の
 * スキーマ、それ以外は issue #10
 * （`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）のスキーマ。
 */

const MATERIALS_ENDPOINT = "/api/materials";
const RUBRICS_ENDPOINT = "/api/rubrics";
const SOAP_KNOWLEDGE_BASE_ENDPOINT = "/api/soap-knowledge-base";
const SOAP_KNOWLEDGE_BASE_ITEMS_ENDPOINT = "/api/soap-knowledge-base-items";
const PROMPT_TEMPLATES_ENDPOINT = "/api/prompt-templates";
const REFERENCE_KNOWLEDGE_ENDPOINT = "/api/reference-knowledge";
const SOAP_MAPPING_VERSIONS_ENDPOINT = "/api/soap-mapping-versions";
const REQUIRED_ITEMS_ENDPOINT = "/api/required-items";
const QUALITY_METRICS_ENDPOINT = "/api/quality-metrics";
const TRAINING_DATA_CLUSTER_ENDPOINT = "/api/training-data-cluster";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

// --- 教材 --------------------------------------------------------------

export async function listMaterials(
  filters: MaterialFilters = {},
  fetchFn: FetchFn = fetch,
): Promise<Material[]> {
  const query = new URLSearchParams();
  if (filters.materialType) {
    query.set("materialType", filters.materialType);
  }
  if (filters.publicationStatus) {
    query.set("publicationStatus", filters.publicationStatus);
  }
  const queryString = query.toString();

  const response = await fetchFn(
    queryString ? `${MATERIALS_ENDPOINT}?${queryString}` : MATERIALS_ENDPOINT,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeMaterials(payload.materials);
}

export async function changeMaterialStatus(
  id: string,
  nextStatus: PublicationStatus,
  fetchFn: FetchFn = fetch,
): Promise<Material> {
  const response = await fetchFn(
    `${MATERIALS_ENDPOINT}/${encodeURIComponent(id)}/status`,
    {
      body: JSON.stringify({ status: nextStatus }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const material = normalizeMaterial(payload);
  if (!material) {
    throw new Error("invalid response from /api/materials/:id/status");
  }
  return material;
}

export type NewMaterialInput = {
  materialType: MaterialType;
  title: string;
  specialtyId?: string;
  learningThemeId?: string;
  difficultyId?: string;
};

/** 新規教材を status: draft で作る（issue #8 の教材候補承認や手動登録の受け口）。 */
export async function addMaterial(
  input: NewMaterialInput,
  fetchFn: FetchFn = fetch,
): Promise<Material> {
  const response = await fetchFn(MATERIALS_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const material = normalizeMaterial(payload);
  if (!material) {
    throw new Error("invalid response from /api/materials");
  }
  return material;
}

// --- 評価ルーブリック（保健師SOAP_KB_詳細設計書_v2 の rubric / rubric_level） -------------

export async function listRubrics(fetchFn: FetchFn = fetch): Promise<Rubric[]> {
  const response = await fetchFn(RUBRICS_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeRubrics(payload.rubrics);
}

export async function setRubricActive(
  id: string,
  isActive: boolean,
  fetchFn: FetchFn = fetch,
): Promise<Rubric> {
  const response = await fetchFn(
    `${RUBRICS_ENDPOINT}/${encodeURIComponent(id)}/active`,
    {
      body: JSON.stringify({ isActive }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const rubric = normalizeRubric(payload);
  if (!rubric) {
    throw new Error("invalid response from /api/rubrics/:id/active");
  }
  return rubric;
}

export type NewRubricLevelInput = {
  level: RubricLevel["level"];
  levelName: string;
  definition: string;
  criteria?: string[];
};

export type NewRubricInput = {
  knowledgeBaseId: string;
  code: string;
  name: string;
  objective: string;
  sortOrder?: number;
  levels: NewRubricLevelInput[];
};

export async function addRubric(
  input: NewRubricInput,
  fetchFn: FetchFn = fetch,
): Promise<Rubric> {
  const response = await fetchFn(RUBRICS_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const rubric = normalizeRubric(payload);
  if (!rubric) {
    throw new Error("invalid response from /api/rubrics");
  }
  return rubric;
}

// --- Knowledge Base（保健師SOAP_KB_詳細設計書_v2 の knowledge_base / knowledge_item） -----

export async function listSoapKnowledgeBases(
  fetchFn: FetchFn = fetch,
): Promise<SoapKnowledgeBase[]> {
  const response = await fetchFn(SOAP_KNOWLEDGE_BASE_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeKnowledgeBases(payload.knowledgeBases);
}

export type NewSoapKnowledgeBaseInput = {
  code: string;
  name: string;
  description?: string;
  version: string;
  status?: KnowledgeBaseStatus;
};

export async function addSoapKnowledgeBase(
  input: NewSoapKnowledgeBaseInput,
  fetchFn: FetchFn = fetch,
): Promise<SoapKnowledgeBase> {
  const response = await fetchFn(SOAP_KNOWLEDGE_BASE_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const knowledgeBase = normalizeKnowledgeBase(payload);
  if (!knowledgeBase) {
    throw new Error("invalid response from /api/soap-knowledge-base");
  }
  return knowledgeBase;
}

export async function setSoapKnowledgeBaseStatus(
  id: string,
  status: KnowledgeBaseStatus,
  fetchFn: FetchFn = fetch,
): Promise<SoapKnowledgeBase> {
  const response = await fetchFn(
    `${SOAP_KNOWLEDGE_BASE_ENDPOINT}/${encodeURIComponent(id)}/status`,
    {
      body: JSON.stringify({ status }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const knowledgeBase = normalizeKnowledgeBase(payload);
  if (!knowledgeBase) {
    throw new Error(
      "invalid response from /api/soap-knowledge-base/:id/status",
    );
  }
  return knowledgeBase;
}

export async function listSoapKnowledgeItems(
  knowledgeBaseId: string,
  fetchFn: FetchFn = fetch,
): Promise<SoapKnowledgeItem[]> {
  const response = await fetchFn(
    `${SOAP_KNOWLEDGE_BASE_ENDPOINT}/${encodeURIComponent(knowledgeBaseId)}/items`,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeKnowledgeItems(payload.items);
}

export type NewSoapKnowledgeItemInput = {
  category: KnowledgeItemCategory;
  itemKey: string;
  title: string;
  content: string;
};

export async function addSoapKnowledgeItem(
  knowledgeBaseId: string,
  input: NewSoapKnowledgeItemInput,
  fetchFn: FetchFn = fetch,
): Promise<SoapKnowledgeItem> {
  const response = await fetchFn(
    `${SOAP_KNOWLEDGE_BASE_ENDPOINT}/${encodeURIComponent(knowledgeBaseId)}/items`,
    {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const item = normalizeKnowledgeItem(payload);
  if (!item) {
    throw new Error("invalid response from /api/soap-knowledge-base/:id/items");
  }
  return item;
}

export async function setSoapKnowledgeItemActive(
  id: string,
  isActive: boolean,
  fetchFn: FetchFn = fetch,
): Promise<SoapKnowledgeItem> {
  const response = await fetchFn(
    `${SOAP_KNOWLEDGE_BASE_ITEMS_ENDPOINT}/${encodeURIComponent(id)}/active`,
    {
      body: JSON.stringify({ isActive }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const item = normalizeKnowledgeItem(payload);
  if (!item) {
    throw new Error(
      "invalid response from /api/soap-knowledge-base-items/:id/active",
    );
  }
  return item;
}

// --- Prompt Template（保健師SOAP_KB_詳細設計書_v2 の prompt_template、CRUDのみ） ---------

export async function listPromptTemplates(
  fetchFn: FetchFn = fetch,
): Promise<PromptTemplate[]> {
  const response = await fetchFn(PROMPT_TEMPLATES_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizePromptTemplates(payload.promptTemplates);
}

export type NewPromptTemplateInput = {
  knowledgeBaseId: string;
  code: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
};

export async function addPromptTemplate(
  input: NewPromptTemplateInput,
  fetchFn: FetchFn = fetch,
): Promise<PromptTemplate> {
  const response = await fetchFn(PROMPT_TEMPLATES_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const promptTemplate = normalizePromptTemplate(payload);
  if (!promptTemplate) {
    throw new Error("invalid response from /api/prompt-templates");
  }
  return promptTemplate;
}

// --- 参照知識（read-only） ------------------------------------------------

export async function listReferenceKnowledge(
  fetchFn: FetchFn = fetch,
): Promise<ReferenceKnowledge[]> {
  const response = await fetchFn(REFERENCE_KNOWLEDGE_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeReferenceKnowledgeList(payload.referenceKnowledge);
}

// --- SOAP マッピング -----------------------------------------------------

export async function listSoapMappingVersions(
  recordType: SoapRecordType,
  fetchFn: FetchFn = fetch,
): Promise<SoapMappingVersion[]> {
  const response = await fetchFn(
    `${SOAP_MAPPING_VERSIONS_ENDPOINT}?recordType=${encodeURIComponent(recordType)}`,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeMappingVersions(payload.versions);
}

/** 新規バージョンを作る。既存記録には遡って適用しない（issue #10 の Technical Approach）。 */
export async function addSoapMappingVersion(
  recordType: SoapRecordType,
  mappingDefinition: MappingDefinition,
  fetchFn: FetchFn = fetch,
): Promise<SoapMappingVersion[]> {
  const response = await fetchFn(SOAP_MAPPING_VERSIONS_ENDPOINT, {
    body: JSON.stringify({ mappingDefinition, recordType }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeMappingVersions(payload.versions);
}

// --- 必須・推奨項目 -------------------------------------------------------

export async function listRequiredItems(
  filters: RequiredItemFilters = {},
  fetchFn: FetchFn = fetch,
): Promise<RequiredRecommendedItem[]> {
  const query = new URLSearchParams();
  if (filters.recordType) {
    query.set("recordType", filters.recordType);
  }
  if (filters.specialtyId) {
    query.set("specialtyId", filters.specialtyId);
  }
  const queryString = query.toString();

  const response = await fetchFn(
    queryString
      ? `${REQUIRED_ITEMS_ENDPOINT}?${queryString}`
      : REQUIRED_ITEMS_ENDPOINT,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeRequiredItems(payload.items);
}

export type NewRequiredItemInput = {
  recordType: SoapRecordType;
  specialtyId?: string;
  itemName: string;
  requirementLevel: RequirementLevel;
  aggregationCategory: string;
};

export async function addRequiredItem(
  input: NewRequiredItemInput,
  fetchFn: FetchFn = fetch,
): Promise<RequiredRecommendedItem> {
  const response = await fetchFn(REQUIRED_ITEMS_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const item = normalizeRequiredItem(payload);
  if (!item) {
    throw new Error("invalid response from /api/required-items");
  }
  return item;
}

// --- 品質指標（read-only） ------------------------------------------------

export async function listQualityMetrics(
  fetchFn: FetchFn = fetch,
): Promise<QualityMetricDefinition[]> {
  const response = await fetchFn(QUALITY_METRICS_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeQualityMetrics(payload.metrics);
}

// --- Training Data Store（Aurora）cluster 起動 ------------------------------

/** 現在の Training Data Store（Aurora Serverless v2）cluster の status を取得する。 */
export async function getTrainingDataClusterStatus(
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const response = await fetchFn(TRAINING_DATA_CLUSTER_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return trimmedText(payload.status) || "unknown";
}

/**
 * Training Data Store（Aurora Serverless v2）の cluster を起動する。
 *
 * scale-to-zero の自動 pause と違い、手動 stop された cluster は Data API 呼び出しでは
 * 復帰しないため、開発者が CLI で `aws rds start-db-cluster` を叩く代わりに UI から
 * `POST /api/training-data-cluster/start` を呼べるようにする。
 */
export async function startTrainingDataCluster(
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const response = await fetchFn(`${TRAINING_DATA_CLUSTER_ENDPOINT}/start`, {
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return trimmedText(payload.status) || "unknown";
}

// --- helpers --------------------------------------------------------------

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}));
  return asRecord(payload);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isOneOf<T extends string>(
  options: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (options as readonly string[]).includes(value)
  );
}

function normalizeMaterials(value: unknown): Material[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeMaterial(asRecord(entry)))
    .filter((material): material is Material => material !== undefined);
}

function normalizeMaterial(
  record: Record<string, unknown>,
): Material | undefined {
  const id = trimmedText(record.id);
  const materialType = record.materialType;
  const title = trimmedText(record.title);
  const publicationStatus = record.publicationStatus;
  const createdBy = trimmedText(record.createdBy);
  const createdAt = trimmedText(record.createdAt);

  if (
    !id ||
    !isOneOf(MATERIAL_TYPES, materialType) ||
    !title ||
    !isOneOf(PUBLICATION_STATUSES, publicationStatus) ||
    !createdBy ||
    !createdAt
  ) {
    return undefined;
  }

  return {
    createdAt,
    createdBy,
    difficultyId: trimmedText(record.difficultyId) || undefined,
    id,
    learningThemeId: trimmedText(record.learningThemeId) || undefined,
    materialType,
    publicationStatus,
    revisions: normalizeRevisions(record.revisions),
    specialtyId: trimmedText(record.specialtyId) || undefined,
    title,
  };
}

function normalizeRevisions(value: unknown): MaterialRevision[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeRevision(asRecord(entry)))
    .filter((revision): revision is MaterialRevision => revision !== undefined);
}

function normalizeRevision(
  record: Record<string, unknown>,
): MaterialRevision | undefined {
  const rawFromStatus = record.fromStatus;
  const toStatus = record.toStatus;
  const changedBy = trimmedText(record.changedBy);
  const changedAt = trimmedText(record.changedAt);

  if (!isOneOf(PUBLICATION_STATUSES, toStatus) || !changedBy || !changedAt) {
    return undefined;
  }

  return {
    changedAt,
    changedBy,
    fromStatus: isOneOf(PUBLICATION_STATUSES, rawFromStatus)
      ? rawFromStatus
      : null,
    toStatus,
  };
}

function normalizeRubrics(value: unknown): Rubric[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeRubric(asRecord(entry)))
    .filter((rubric): rubric is Rubric => rubric !== undefined);
}

function normalizeRubric(record: Record<string, unknown>): Rubric | undefined {
  const id = trimmedText(record.id);
  const knowledgeBaseId = trimmedText(record.knowledgeBaseId);
  const code = trimmedText(record.code);
  const name = trimmedText(record.name);
  const objective = trimmedText(record.objective);
  const createdAt = trimmedText(record.createdAt);

  if (!id || !knowledgeBaseId || !code || !name || !objective || !createdAt) {
    return undefined;
  }

  return {
    code,
    createdAt,
    id,
    isActive: record.isActive === true,
    knowledgeBaseId,
    levels: normalizeRubricLevels(record.levels),
    name,
    objective,
    sortOrder: numberOrZero(record.sortOrder),
  };
}

function normalizeRubricLevels(value: unknown): RubricLevel[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeRubricLevel(asRecord(entry)))
    .filter((level): level is RubricLevel => level !== undefined);
}

function normalizeRubricLevel(
  record: Record<string, unknown>,
): RubricLevel | undefined {
  const level = record.level;
  const levelName = trimmedText(record.levelName);
  const definition = trimmedText(record.definition);

  if (!isRubricLevelNumber(level) || !levelName || !definition) {
    return undefined;
  }

  return {
    criteria: stringArray(record.criteria),
    definition,
    level,
    levelName,
  };
}

function normalizeKnowledgeBases(value: unknown): SoapKnowledgeBase[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeKnowledgeBase(asRecord(entry)))
    .filter((kb): kb is SoapKnowledgeBase => kb !== undefined);
}

function normalizeKnowledgeBase(
  record: Record<string, unknown>,
): SoapKnowledgeBase | undefined {
  const id = trimmedText(record.id);
  const code = trimmedText(record.code);
  const name = trimmedText(record.name);
  const version = trimmedText(record.version);
  const status = record.status;
  const createdAt = trimmedText(record.createdAt);

  if (
    !id ||
    !code ||
    !name ||
    !version ||
    !isOneOf(KNOWLEDGE_BASE_STATUSES, status) ||
    !createdAt
  ) {
    return undefined;
  }

  return {
    code,
    createdAt,
    description: trimmedText(record.description) || undefined,
    id,
    name,
    status,
    version,
  };
}

function normalizeKnowledgeItems(value: unknown): SoapKnowledgeItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeKnowledgeItem(asRecord(entry)))
    .filter((item): item is SoapKnowledgeItem => item !== undefined);
}

function normalizeKnowledgeItem(
  record: Record<string, unknown>,
): SoapKnowledgeItem | undefined {
  const id = trimmedText(record.id);
  const knowledgeBaseId = trimmedText(record.knowledgeBaseId);
  const category = record.category;
  const itemKey = trimmedText(record.itemKey);
  const title = trimmedText(record.title);
  const content = trimmedText(record.content);

  if (
    !id ||
    !knowledgeBaseId ||
    !isOneOf(KNOWLEDGE_ITEM_CATEGORIES, category) ||
    !itemKey ||
    !title ||
    !content
  ) {
    return undefined;
  }

  return {
    category,
    content,
    id,
    isActive: record.isActive === true,
    itemKey,
    knowledgeBaseId,
    title,
  };
}

function normalizePromptTemplates(value: unknown): PromptTemplate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizePromptTemplate(asRecord(entry)))
    .filter((template): template is PromptTemplate => template !== undefined);
}

function normalizePromptTemplate(
  record: Record<string, unknown>,
): PromptTemplate | undefined {
  const id = trimmedText(record.id);
  const knowledgeBaseId = trimmedText(record.knowledgeBaseId);
  const code = trimmedText(record.code);
  const name = trimmedText(record.name);
  const systemPrompt = trimmedText(record.systemPrompt);
  const userPromptTemplate = trimmedText(record.userPromptTemplate);
  const version = trimmedText(record.version);
  const createdAt = trimmedText(record.createdAt);

  if (
    !id ||
    !knowledgeBaseId ||
    !code ||
    !name ||
    !systemPrompt ||
    !userPromptTemplate ||
    !version ||
    !createdAt
  ) {
    return undefined;
  }

  return {
    code,
    createdAt,
    id,
    isActive: record.isActive === true,
    knowledgeBaseId,
    name,
    systemPrompt,
    userPromptTemplate,
    version,
  };
}

function normalizeReferenceKnowledgeList(value: unknown): ReferenceKnowledge[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeReferenceKnowledge(asRecord(entry)))
    .filter((item): item is ReferenceKnowledge => item !== undefined);
}

function normalizeReferenceKnowledge(
  record: Record<string, unknown>,
): ReferenceKnowledge | undefined {
  const id = trimmedText(record.id);
  const title = trimmedText(record.title);
  const summary = trimmedText(record.summary);
  const sourceType = record.sourceType;

  if (
    !id ||
    !title ||
    !summary ||
    !isOneOf(REFERENCE_KNOWLEDGE_SOURCE_TYPES, sourceType)
  ) {
    return undefined;
  }

  return {
    externalKbRef: trimmedText(record.externalKbRef) || undefined,
    id,
    linkedMaterialIds: stringArray(record.linkedMaterialIds),
    linkedRubricIds: stringArray(record.linkedRubricIds),
    sourceType: sourceType as ReferenceKnowledgeSourceType,
    summary,
    title,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeMappingVersions(value: unknown): SoapMappingVersion[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeMappingVersion(asRecord(entry)))
    .filter((version): version is SoapMappingVersion => version !== undefined);
}

function normalizeMappingVersion(
  record: Record<string, unknown>,
): SoapMappingVersion | undefined {
  const id = trimmedText(record.id);
  const recordType = record.recordType;
  const versionNo = numberOrZero(record.versionNo);
  const mappingDefinition = normalizeMappingDefinition(
    record.mappingDefinition,
  );
  const isCurrent = record.isCurrent === true;
  const effectiveFrom = trimmedText(record.effectiveFrom);
  const createdBy = trimmedText(record.createdBy);

  if (
    !id ||
    !isSoapRecordType(recordType) ||
    versionNo <= 0 ||
    !mappingDefinition ||
    !effectiveFrom ||
    !createdBy
  ) {
    return undefined;
  }

  return {
    createdBy,
    effectiveFrom,
    id,
    isCurrent,
    mappingDefinition,
    recordType,
    versionNo,
  };
}

function normalizeMappingDefinition(
  value: unknown,
): MappingDefinition | undefined {
  const record = asRecord(value);
  const result: Partial<MappingDefinition> = {};
  for (const category of MAPPING_CATEGORIES) {
    const text = trimmedText(record[category]);
    if (!text) {
      return undefined;
    }
    result[category] = text;
  }
  return result as MappingDefinition;
}

function normalizeRequiredItems(value: unknown): RequiredRecommendedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeRequiredItem(asRecord(entry)))
    .filter((item): item is RequiredRecommendedItem => item !== undefined);
}

function normalizeRequiredItem(
  record: Record<string, unknown>,
): RequiredRecommendedItem | undefined {
  const id = trimmedText(record.id);
  const recordType = record.recordType;
  const itemName = trimmedText(record.itemName);
  const requirementLevel = record.requirementLevel;
  const aggregationCategory = trimmedText(record.aggregationCategory);

  if (
    !id ||
    !isSoapRecordType(recordType) ||
    !itemName ||
    !isOneOf(REQUIREMENT_LEVELS, requirementLevel) ||
    !aggregationCategory
  ) {
    return undefined;
  }

  return {
    aggregationCategory,
    id,
    itemName,
    recordType,
    requirementLevel,
    specialtyId: trimmedText(record.specialtyId) || undefined,
  };
}

function normalizeQualityMetrics(value: unknown): QualityMetricDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeQualityMetric(asRecord(entry)))
    .filter(
      (metric): metric is QualityMetricDefinition => metric !== undefined,
    );
}

function normalizeQualityMetric(
  record: Record<string, unknown>,
): QualityMetricDefinition | undefined {
  const metricKey = trimmedText(record.metricKey);
  const displayName = trimmedText(record.displayName);
  const calculationDescription = trimmedText(record.calculationDescription);
  const targetEntity = trimmedText(record.targetEntity);

  if (!metricKey || !displayName || !calculationDescription || !targetEntity) {
    return undefined;
  }

  return { calculationDescription, displayName, metricKey, targetEntity };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
