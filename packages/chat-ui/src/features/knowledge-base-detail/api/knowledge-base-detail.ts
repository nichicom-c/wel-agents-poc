const KNOWLEDGE_BASES_ENDPOINT = "/api/knowledge-bases";
const KB_NOT_CONFIGURED_ERROR = "Knowledge Base is not configured";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export const KNOWLEDGE_BASE_DOMAINS = [
  "database",
  "document",
  "law",
  "medical_care_law",
  "support_activity",
] as const;

export type KnowledgeBaseDomain = (typeof KNOWLEDGE_BASE_DOMAINS)[number];

export type KnowledgeBaseSummary = {
  createdAt?: string;
  description?: string;
  failureReasons: string[];
  knowledgeBaseArn?: string;
  knowledgeBaseId: string;
  name?: string;
  roleArn?: string;
  status?: string;
  storage?: unknown;
  type?: string;
  updatedAt?: string;
  vectorConfiguration?: unknown;
  sqlConfiguration?: unknown;
};

export type KnowledgeBaseDataSourceSummary = {
  dataSourceId: string;
  description?: string;
  knowledgeBaseId: string;
  name?: string;
  status?: string;
  updatedAt?: string;
};

export type KnowledgeBaseDocumentIdentifier = {
  customId?: string;
  dataSourceType?: string;
  s3Uri?: string;
};

export type KnowledgeBaseDocumentSummary = {
  dataSourceId: string;
  identifier: KnowledgeBaseDocumentIdentifier;
  knowledgeBaseId: string;
  status?: string;
  statusReason?: string;
  updatedAt?: string;
};

export type KnowledgeBaseOverview = {
  dataSources: KnowledgeBaseDataSourceSummary[];
  domain: KnowledgeBaseDomain;
  knowledgeBase: KnowledgeBaseSummary;
  knowledgeBaseId: string;
  nextToken?: string;
};

export type KnowledgeBaseDocuments = {
  dataSourceId: string;
  documents: KnowledgeBaseDocumentSummary[];
  domain: KnowledgeBaseDomain;
  knowledgeBaseId: string;
  nextToken?: string;
};

export type RequestKnowledgeBaseOverviewOptions = {
  accessToken: string;
  domain: KnowledgeBaseDomain;
  fetchFn?: FetchFn;
};

export type RequestKnowledgeBaseDocumentsOptions =
  RequestKnowledgeBaseOverviewOptions & {
    dataSourceId: string;
    maxResults?: number;
    nextToken?: string;
  };

export class KnowledgeBaseNotConfiguredError extends Error {
  override name = "KnowledgeBaseNotConfiguredError";
}

export async function requestKnowledgeBaseOverview({
  accessToken,
  domain,
  fetchFn = fetch,
}: RequestKnowledgeBaseOverviewOptions): Promise<KnowledgeBaseOverview> {
  const response = await fetchKnowledgeBaseJson({
    accessToken,
    endpoint: `${KNOWLEDGE_BASES_ENDPOINT}/${encodeURIComponent(domain)}`,
    fetchFn,
  });

  return normalizeOverview(response, domain);
}

export async function requestKnowledgeBaseDocuments({
  accessToken,
  dataSourceId,
  domain,
  fetchFn = fetch,
  maxResults,
  nextToken,
}: RequestKnowledgeBaseDocumentsOptions): Promise<KnowledgeBaseDocuments> {
  const params = new URLSearchParams();
  if (Number.isFinite(maxResults)) {
    params.set("maxResults", String(maxResults));
  }
  if (text(nextToken)) {
    params.set("nextToken", text(nextToken));
  }

  const response = await fetchKnowledgeBaseJson({
    accessToken,
    endpoint:
      `${KNOWLEDGE_BASES_ENDPOINT}/${encodeURIComponent(domain)}` +
      `/data-sources/${encodeURIComponent(dataSourceId)}/documents` +
      (params.size > 0 ? `?${params.toString()}` : ""),
    fetchFn,
  });

  return normalizeDocuments(response, domain, dataSourceId);
}

export function isKnowledgeBaseDomain(
  value: string,
): value is KnowledgeBaseDomain {
  return KNOWLEDGE_BASE_DOMAINS.includes(value as KnowledgeBaseDomain);
}

export function isKnowledgeBaseNotConfiguredError(error: unknown): boolean {
  return error instanceof KnowledgeBaseNotConfiguredError;
}

async function fetchKnowledgeBaseJson({
  accessToken,
  endpoint,
  fetchFn,
}: {
  accessToken: string;
  endpoint: string;
  fetchFn: FetchFn;
}): Promise<Record<string, unknown>> {
  const cleanedToken = accessToken.trim();
  if (!cleanedToken) {
    throw new Error("access token is required");
  }

  const response = await fetchFn(endpoint, {
    headers: {
      authorization: `Bearer ${cleanedToken}`,
    },
    method: "GET",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    const message =
      text(payload.error) || text(payload.message) || `HTTP ${response.status}`;

    if (response.status === 503 && message === KB_NOT_CONFIGURED_ERROR) {
      throw new KnowledgeBaseNotConfiguredError(message);
    }

    throw new Error(message);
  }

  return payload;
}

function normalizeOverview(
  payload: Record<string, unknown>,
  requestedDomain: KnowledgeBaseDomain,
): KnowledgeBaseOverview {
  const knowledgeBase = normalizeKnowledgeBase(
    asRecord(payload.knowledgeBase),
    text(payload.knowledgeBaseId) || "unknown",
  );

  return {
    dataSources: Array.isArray(payload.dataSources)
      ? payload.dataSources.flatMap(normalizeDataSource)
      : [],
    domain: domainOrFallback(payload.domain, requestedDomain),
    knowledgeBase,
    knowledgeBaseId:
      text(payload.knowledgeBaseId) || knowledgeBase.knowledgeBaseId,
    ...(text(payload.nextToken) ? { nextToken: text(payload.nextToken) } : {}),
  };
}

function normalizeDocuments(
  payload: Record<string, unknown>,
  requestedDomain: KnowledgeBaseDomain,
  requestedDataSourceId: string,
): KnowledgeBaseDocuments {
  return {
    dataSourceId: text(payload.dataSourceId) || requestedDataSourceId,
    documents: Array.isArray(payload.documents)
      ? payload.documents.flatMap(normalizeDocument)
      : [],
    domain: domainOrFallback(payload.domain, requestedDomain),
    knowledgeBaseId: text(payload.knowledgeBaseId) || "unknown",
    ...(text(payload.nextToken) ? { nextToken: text(payload.nextToken) } : {}),
  };
}

function normalizeKnowledgeBase(
  value: Record<string, unknown>,
  fallbackId: string,
): KnowledgeBaseSummary {
  return {
    ...(validIsoDate(text(value.createdAt))
      ? { createdAt: text(value.createdAt) }
      : {}),
    ...(text(value.description)
      ? { description: text(value.description) }
      : {}),
    failureReasons: Array.isArray(value.failureReasons)
      ? value.failureReasons.flatMap((item) => (text(item) ? [text(item)] : []))
      : [],
    ...(text(value.knowledgeBaseArn)
      ? { knowledgeBaseArn: text(value.knowledgeBaseArn) }
      : {}),
    knowledgeBaseId: text(value.knowledgeBaseId) || fallbackId,
    ...(text(value.name) ? { name: text(value.name) } : {}),
    ...(text(value.roleArn) ? { roleArn: text(value.roleArn) } : {}),
    ...(text(value.status) ? { status: text(value.status) } : {}),
    ...(value.storage !== undefined ? { storage: value.storage } : {}),
    ...(text(value.type) ? { type: text(value.type) } : {}),
    ...(validIsoDate(text(value.updatedAt))
      ? { updatedAt: text(value.updatedAt) }
      : {}),
    ...(value.vectorConfiguration !== undefined
      ? { vectorConfiguration: value.vectorConfiguration }
      : {}),
    ...(value.sqlConfiguration !== undefined
      ? { sqlConfiguration: value.sqlConfiguration }
      : {}),
  };
}

function normalizeDataSource(value: unknown): KnowledgeBaseDataSourceSummary[] {
  const record = asRecord(value);
  const dataSourceId = text(record.dataSourceId);
  const knowledgeBaseId = text(record.knowledgeBaseId);
  if (!dataSourceId || !knowledgeBaseId) {
    return [];
  }

  return [
    {
      dataSourceId,
      ...(text(record.description)
        ? { description: text(record.description) }
        : {}),
      knowledgeBaseId,
      ...(text(record.name) ? { name: text(record.name) } : {}),
      ...(text(record.status) ? { status: text(record.status) } : {}),
      ...(validIsoDate(text(record.updatedAt))
        ? { updatedAt: text(record.updatedAt) }
        : {}),
    },
  ];
}

function normalizeDocument(value: unknown): KnowledgeBaseDocumentSummary[] {
  const record = asRecord(value);
  const dataSourceId = text(record.dataSourceId);
  const knowledgeBaseId = text(record.knowledgeBaseId);
  if (!dataSourceId || !knowledgeBaseId) {
    return [];
  }

  const identifier = asRecord(record.identifier);
  return [
    {
      dataSourceId,
      identifier: {
        ...(text(identifier.customId)
          ? { customId: text(identifier.customId) }
          : {}),
        ...(text(identifier.dataSourceType)
          ? { dataSourceType: text(identifier.dataSourceType) }
          : {}),
        ...(text(identifier.s3Uri) ? { s3Uri: text(identifier.s3Uri) } : {}),
      },
      knowledgeBaseId,
      ...(text(record.status) ? { status: text(record.status) } : {}),
      ...(text(record.statusReason)
        ? { statusReason: text(record.statusReason) }
        : {}),
      ...(validIsoDate(text(record.updatedAt))
        ? { updatedAt: text(record.updatedAt) }
        : {}),
    },
  ];
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}));
  return asRecord(payload);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function domainOrFallback(
  value: unknown,
  fallback: KnowledgeBaseDomain,
): KnowledgeBaseDomain {
  const candidate = text(value);
  return isKnowledgeBaseDomain(candidate) ? candidate : fallback;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validIsoDate(value: string): string {
  return Number.isNaN(Date.parse(value)) ? "" : value;
}
