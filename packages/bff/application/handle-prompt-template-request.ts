import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type {
  CreatePromptTemplateInput,
  PromptTemplate,
} from "../contracts/prompt-template.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/prompt-templates";

/**
 * 保健師SOAP_KB_詳細設計書_v2 の prompt_template の BFF handler。
 * 今回は一覧・作成のみ（AgentCore 実行時には未接続、Admin 管理用）。
 */
export type HandlePromptTemplateOptions = {
  authContext?: AuthenticatedUserContext;
  listPromptTemplates: () => Promise<PromptTemplate[]>;
  createPromptTemplate: (
    input: CreatePromptTemplateInput,
  ) => Promise<PromptTemplate>;
  logError?: (message: string, detail: Record<string, unknown>) => void;
  trainingDataConfigured?: boolean;
};

export async function handlePromptTemplateRequest(
  request: BffHttpRequest,
  options: HandlePromptTemplateOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && request.path === COLLECTION_PATH) {
    return response(204, {});
  }

  if (request.path !== COLLECTION_PATH) {
    return response(404, { error: "not found" });
  }

  if (!options.trainingDataConfigured) {
    return response(503, { error: "training data store is not configured" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  try {
    if (request.method === "GET") {
      const promptTemplates = await options.listPromptTemplates();
      return response(200, { promptTemplates });
    }

    if (request.method === "POST") {
      return await handleCreate(request, options);
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("prompt template request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "prompt template request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  options: HandlePromptTemplateOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const knowledgeBaseId = textField(body.knowledgeBaseId);
  if (!knowledgeBaseId) {
    throw new BadRequestError("knowledgeBaseId is required");
  }
  const code = textField(body.code);
  if (!code) {
    throw new BadRequestError("code is required");
  }
  const name = textField(body.name);
  if (!name) {
    throw new BadRequestError("name is required");
  }
  const systemPrompt = textField(body.systemPrompt);
  if (!systemPrompt) {
    throw new BadRequestError("systemPrompt is required");
  }
  const userPromptTemplate = textField(body.userPromptTemplate);
  if (!userPromptTemplate) {
    throw new BadRequestError("userPromptTemplate is required");
  }

  const promptTemplate = await options.createPromptTemplate({
    code,
    knowledgeBaseId,
    name,
    outputSchema: isRecord(body.outputSchema) ? body.outputSchema : undefined,
    systemPrompt,
    userPromptTemplate,
  });

  return response(200, promptTemplate);
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
