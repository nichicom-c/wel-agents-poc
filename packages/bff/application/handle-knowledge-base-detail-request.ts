import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type {
  KnowledgeBaseDocumentsResponse,
  KnowledgeBaseDomain,
  KnowledgeBaseIds,
  KnowledgeBaseOverviewResponse,
} from "../contracts/knowledge-base-detail.ts";
import { isKnowledgeBaseDomain } from "../contracts/knowledge-base-detail.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const DOCUMENTS_PATH_PATTERN =
  /^\/api\/knowledge-bases\/([^/]+)\/data-sources\/([^/]+)\/documents$/;
const OVERVIEW_PATH_PATTERN = /^\/api\/knowledge-bases\/([^/]+)$/;
const DEFAULT_MAX_RESULTS = 100;
const MAX_RESULTS_LIMIT = 1000;

export type KnowledgeBaseOverviewInput = {
  domain: KnowledgeBaseDomain;
  knowledgeBaseId: string;
};

export type KnowledgeBaseDocumentsInput = KnowledgeBaseOverviewInput & {
  dataSourceId: string;
  maxResults: number;
  nextToken?: string;
};

export type KnowledgeBaseDetailProvider = {
  getOverview(
    input: KnowledgeBaseOverviewInput,
  ): Promise<KnowledgeBaseOverviewResponse>;
  listDocuments(
    input: KnowledgeBaseDocumentsInput,
  ): Promise<KnowledgeBaseDocumentsResponse>;
};

export type HandleKnowledgeBaseDetailOptions = {
  authContext?: AuthenticatedUserContext;
  getKnowledgeBaseDetail: KnowledgeBaseDetailProvider;
  knowledgeBaseIds: KnowledgeBaseIds;
  logError?: (message: string, detail: Record<string, unknown>) => void;
};

export async function handleKnowledgeBaseDetailRequest(
  request: BffHttpRequest,
  options: HandleKnowledgeBaseDetailOptions,
): Promise<BffHttpResponse> {
  if (request.method !== "GET") {
    return response(404, { error: "not found" });
  }

  const route = parseRoute(request.path);
  if (!route) {
    return response(404, { error: "not found" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  const knowledgeBaseId = clean(options.knowledgeBaseIds[route.domain]);
  if (!knowledgeBaseId || knowledgeBaseId === "not_configured") {
    return response(503, { error: "Knowledge Base is not configured" });
  }

  try {
    if (route.kind === "overview") {
      return response(
        200,
        await options.getKnowledgeBaseDetail.getOverview({
          domain: route.domain,
          knowledgeBaseId,
        }),
      );
    }

    return response(
      200,
      await options.getKnowledgeBaseDetail.listDocuments({
        dataSourceId: route.dataSourceId,
        domain: route.domain,
        knowledgeBaseId,
        maxResults: boundedMaxResults(request.query?.maxResults),
        ...(clean(request.query?.nextToken)
          ? { nextToken: clean(request.query?.nextToken) }
          : {}),
      }),
    );
  } catch (error) {
    options.logError?.("knowledge base detail request failed", {
      domain: route.domain,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
    });
    return response(statusCodeForError(error), {
      error: "Knowledge Base detail request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

type ParsedRoute =
  | { domain: KnowledgeBaseDomain; kind: "overview" }
  | {
      dataSourceId: string;
      domain: KnowledgeBaseDomain;
      kind: "documents";
    };

function parseRoute(path: string): ParsedRoute | null {
  const documentsMatch = DOCUMENTS_PATH_PATTERN.exec(path);
  if (documentsMatch) {
    const [, domain, dataSourceId] = documentsMatch;
    if (!domain || !dataSourceId || !isKnowledgeBaseDomain(domain)) {
      return null;
    }
    return { dataSourceId, domain, kind: "documents" };
  }

  const overviewMatch = OVERVIEW_PATH_PATTERN.exec(path);
  if (overviewMatch) {
    const [, domain] = overviewMatch;
    if (!domain || !isKnowledgeBaseDomain(domain)) {
      return null;
    }
    return { domain, kind: "overview" };
  }

  return null;
}

function boundedMaxResults(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.min(Math.max(parsed, 1), MAX_RESULTS_LIMIT);
}

function statusCodeForError(error: unknown): number {
  if (!(error instanceof Error)) {
    return 502;
  }

  if (error.name === "ValidationException") {
    return 400;
  }

  if (error.name === "ResourceNotFoundException") {
    return 404;
  }

  return 502;
}

function clean(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}
