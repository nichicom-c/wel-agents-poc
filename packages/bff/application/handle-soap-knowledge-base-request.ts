import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type {
  CreateSoapKnowledgeBaseInput,
  CreateSoapKnowledgeItemInput,
  SoapKnowledgeBase,
  SoapKnowledgeItem,
} from "../contracts/soap-knowledge-base.ts";
import {
  isKnowledgeBaseStatus,
  isKnowledgeItemCategory,
} from "../contracts/soap-knowledge-base.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/soap-knowledge-base";
const STATUS_PATH_PATTERN = /^\/api\/soap-knowledge-base\/([^/]+)\/status$/;
const ITEMS_PATH_PATTERN = /^\/api\/soap-knowledge-base\/([^/]+)\/items$/;
const ITEM_ACTIVE_PATH_PATTERN =
  /^\/api\/soap-knowledge-base-items\/([^/]+)\/active$/;

/**
 * 保健師SOAP_KB_詳細設計書_v2 の固定 Knowledge Base（knowledge_base / knowledge_item）の
 * BFF handler。既存の Bedrock vector KB 管理（`/api/knowledge-bases/{domain}`）とは無関係の
 * 別概念のため、ルートは一貫して `soap-knowledge-base` とする。
 */
export type HandleSoapKnowledgeBaseOptions = {
  authContext?: AuthenticatedUserContext;
  listKnowledgeBases: () => Promise<SoapKnowledgeBase[]>;
  createKnowledgeBase: (
    input: CreateSoapKnowledgeBaseInput,
  ) => Promise<SoapKnowledgeBase>;
  setKnowledgeBaseStatus: (input: {
    id: string;
    status: string;
  }) => Promise<SoapKnowledgeBase>;
  listKnowledgeItems: (input: {
    knowledgeBaseId: string;
  }) => Promise<SoapKnowledgeItem[]>;
  createKnowledgeItem: (
    input: CreateSoapKnowledgeItemInput,
  ) => Promise<SoapKnowledgeItem>;
  setKnowledgeItemActive: (input: {
    id: string;
    isActive: boolean;
  }) => Promise<SoapKnowledgeItem>;
  logError?: (message: string, detail: Record<string, unknown>) => void;
  trainingDataConfigured?: boolean;
};

export async function handleSoapKnowledgeBaseRequest(
  request: BffHttpRequest,
  options: HandleSoapKnowledgeBaseOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isSoapKnowledgeBasePath(request.path)) {
    return response(204, {});
  }

  if (!isSoapKnowledgeBasePath(request.path)) {
    return response(404, { error: "not found" });
  }

  if (!options.trainingDataConfigured) {
    return response(503, { error: "training data store is not configured" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  try {
    if (request.method === "GET" && request.path === COLLECTION_PATH) {
      const knowledgeBases = await options.listKnowledgeBases();
      return response(200, { knowledgeBases });
    }

    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleCreateKnowledgeBase(request, options);
    }

    const statusId = idFromPath(STATUS_PATH_PATTERN, request.path);
    if (statusId && request.method === "PATCH") {
      return await handleSetKnowledgeBaseStatus(request, statusId, options);
    }

    const itemsKnowledgeBaseId = idFromPath(ITEMS_PATH_PATTERN, request.path);
    if (itemsKnowledgeBaseId && request.method === "GET") {
      const items = await options.listKnowledgeItems({
        knowledgeBaseId: itemsKnowledgeBaseId,
      });
      return response(200, { items });
    }
    if (itemsKnowledgeBaseId && request.method === "POST") {
      return await handleCreateKnowledgeItem(
        request,
        itemsKnowledgeBaseId,
        options,
      );
    }

    const itemActiveId = idFromPath(ITEM_ACTIVE_PATH_PATTERN, request.path);
    if (itemActiveId && request.method === "PATCH") {
      return await handleSetKnowledgeItemActive(request, itemActiveId, options);
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("soap knowledge base request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "soap knowledge base request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreateKnowledgeBase(
  request: BffHttpRequest,
  options: HandleSoapKnowledgeBaseOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const code = textField(body.code);
  if (!code) {
    throw new BadRequestError("code is required");
  }
  const name = textField(body.name);
  if (!name) {
    throw new BadRequestError("name is required");
  }
  const version = textField(body.version);
  if (!version) {
    throw new BadRequestError("version is required");
  }
  const status = body.status;
  if (status !== undefined && !isKnowledgeBaseStatus(status)) {
    throw new BadRequestError("status must be one of draft, active, archived");
  }

  const knowledgeBase = await options.createKnowledgeBase({
    code,
    description: textField(body.description) || undefined,
    name,
    status,
    version,
  });

  return response(200, knowledgeBase);
}

async function handleSetKnowledgeBaseStatus(
  request: BffHttpRequest,
  id: string,
  options: HandleSoapKnowledgeBaseOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);
  const status = body.status;
  if (!isKnowledgeBaseStatus(status)) {
    throw new BadRequestError("status must be one of draft, active, archived");
  }

  const knowledgeBase = await options.setKnowledgeBaseStatus({ id, status });
  return response(200, knowledgeBase);
}

async function handleCreateKnowledgeItem(
  request: BffHttpRequest,
  knowledgeBaseId: string,
  options: HandleSoapKnowledgeBaseOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const category = body.category;
  if (!isKnowledgeItemCategory(category)) {
    throw new BadRequestError("category must be a valid knowledge category");
  }
  const itemKey = textField(body.itemKey);
  if (!itemKey) {
    throw new BadRequestError("itemKey is required");
  }
  const title = textField(body.title);
  if (!title) {
    throw new BadRequestError("title is required");
  }
  const content = textField(body.content);
  if (!content) {
    throw new BadRequestError("content is required");
  }

  const item = await options.createKnowledgeItem({
    category,
    content,
    itemKey,
    knowledgeBaseId,
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
    title,
  });

  return response(200, item);
}

async function handleSetKnowledgeItemActive(
  request: BffHttpRequest,
  id: string,
  options: HandleSoapKnowledgeBaseOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);
  if (typeof body.isActive !== "boolean") {
    throw new BadRequestError("isActive must be a boolean");
  }

  const item = await options.setKnowledgeItemActive({
    id,
    isActive: body.isActive,
  });
  return response(200, item);
}

function isSoapKnowledgeBasePath(path: string): boolean {
  return (
    path === COLLECTION_PATH ||
    STATUS_PATH_PATTERN.test(path) ||
    ITEMS_PATH_PATTERN.test(path) ||
    ITEM_ACTIVE_PATH_PATTERN.test(path)
  );
}

function idFromPath(pattern: RegExp, path: string): string | undefined {
  const match = pattern.exec(path);
  const id = match?.[1];
  return id ? decodeURIComponent(id) : undefined;
}

function parseJsonBody(request: BffHttpRequest): Record<string, unknown> {
  const rawBody = request.isBase64Encoded
    ? Buffer.from(request.body || "", "base64").toString("utf8")
    : request.body || "{}";

  try {
    const parsed = JSON.parse(rawBody);
    return isRecord(parsed) ? parsed : {};
  } catch {
    throw new BadRequestError("request body must be valid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}

class BadRequestError extends Error {
  override name = "BadRequestError";
}
