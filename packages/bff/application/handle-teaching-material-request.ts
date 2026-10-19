import { randomUUID } from "node:crypto";

import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { Masters } from "../contracts/masters.ts";
import type { RuntimeInvoker, RuntimePayload } from "../contracts/runtime.ts";
import { textField } from "../domain/chat-session.ts";

/** BFF core の依存。adapter ごとに actor ID / Runtime 呼び出し / logging を注入する。 */
export type HandleTeachingMaterialOptions = {
  /** RuntimePayload に埋め込む actor ID。 */
  actorId: string;
  /** AgentCore Runtime を呼び出す adapter 実装。 */
  invokeRuntime: RuntimeInvoker;
  /**
   * 分類の推奨に使うマスタの読み出し（Training Data Store）。未設定・失敗時は分類の選択肢を
   * 渡さず、本文の生成だけを行う（生成そのものは DB に依存しない）。
   */
  getMasters?: () => Promise<Masters>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** runtime session ID 生成（テスト用。省略時は randomUUID）。 */
  createSessionId?: () => string;
};

/**
 * Knowledge Review 画面の「コメントを投稿」が呼ぶ BFF handler。
 *
 * 会話ではなく stateless な一回限りの生成リクエストなので、client からの conversationId は
 * 受け取らず、呼び出しごとに新しい runtime session ID を生成して AgentCore Runtime へ渡す。
 * `invokeRuntime` は `/api/chat` と同じ seam を再利用する（transport は agnostic）。専門職
 * コメント本文から教材候補（title / summary / learningObjective / teachingPoints と、分野・
 * 学習テーマ・難易度の推奨）を生成するだけで、この handler 自体は何も永続化しない
 * （保存は `POST /api/material-candidates` が担う）。
 *
 * 分類の推奨に使うマスタは AgentCore が DB を持たないためこの handler が読み、選択肢として
 * payload に載せる。
 */
export async function handleTeachingMaterialRequest(
  request: BffHttpRequest,
  options: HandleTeachingMaterialOptions,
): Promise<BffHttpResponse> {
  try {
    if (
      request.method === "OPTIONS" &&
      request.path === "/api/teaching-material-draft"
    ) {
      return response(204, {});
    }

    if (
      request.method !== "POST" ||
      request.path !== "/api/teaching-material-draft"
    ) {
      return response(404, { error: "not found" });
    }

    const body = parseJsonBody(request);
    const text = textField(body.text);

    if (!text) {
      return response(400, { error: "text is required" });
    }

    const sessionId = (options.createSessionId ?? randomUUID)();
    const classificationOptions = await loadClassificationOptions(options);

    const runtimePayload: RuntimePayload = {
      actor_id: options.actorId,
      type: "teaching_material",
      text,
      session_id: sessionId,
      ...(classificationOptions
        ? { classification_options: classificationOptions }
        : {}),
    };

    const runtimeResponse = await options.invokeRuntime(
      sessionId,
      runtimePayload,
    );

    if (!runtimeResponse.ok) {
      return response(502, {
        error: "AgentCore invoke failed",
        message: runtimeResponse.body,
        statusCode: runtimeResponse.statusCode,
      });
    }

    const payload = asRecord(runtimeResponse.payload);

    if (payload.status === "error") {
      return response(502, {
        error: "AgentCore invoke failed",
        message:
          typeof payload.error === "string" ? payload.error : "unknown error",
      });
    }

    return response(200, {
      title: textField(payload.title),
      summary: textField(payload.summary),
      learningObjective: textField(payload.learningObjective),
      teachingPoints: stringArray(payload.teachingPoints),
      specialtyId: textField(payload.specialtyId) || undefined,
      learningThemeId: textField(payload.learningThemeId) || undefined,
      difficultyId: textField(payload.difficultyId) || undefined,
    });
  } catch (error) {
    const statusCode =
      error instanceof Error && error.name === "AbortError"
        ? 504
        : error instanceof BadRequestError
          ? 400
          : 500;

    if (!(error instanceof BadRequestError)) {
      options.logError?.("teaching material request failed", {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
      });
    }

    return response(statusCode, {
      error:
        error instanceof BadRequestError
          ? error.message
          : statusCode === 504
            ? "AgentCore invoke timed out"
            : "internal server error",
    });
  }
}

/**
 * 分類マスタを読んで runtime payload 用の選択肢に整える。
 *
 * 教材候補の本文生成はマスタに依存しないため、未設定（`getMasters` 無し）も読み出し失敗も
 * error にはせず、分類の推奨だけを諦める。
 */
async function loadClassificationOptions(
  options: HandleTeachingMaterialOptions,
): Promise<RuntimePayload["classification_options"]> {
  if (!options.getMasters) {
    return undefined;
  }

  try {
    const masters = await options.getMasters();
    return {
      difficultyLevels: masters.difficultyLevels,
      learningThemes: masters.learningThemes,
      specialties: masters.specialties,
    };
  } catch (error) {
    options.logError?.("teaching material masters lookup failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
    });
    return undefined;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => textField(entry))
    .filter((entry) => entry.length > 0);
}

/** JSON body を object として parse する。base64 body は UTF-8 に decode してから読む。 */
function parseJsonBody(request: BffHttpRequest): Record<string, unknown> {
  const rawBody = request.isBase64Encoded
    ? Buffer.from(request.body || "", "base64").toString("utf8")
    : request.body || "{}";

  try {
    const parsed = JSON.parse(rawBody);
    return asRecord(parsed);
  } catch {
    throw new BadRequestError("request body must be valid JSON");
  }
}

/** Lambda 互換の JSON response を組み立てる。 */
function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}

/** unknown 値が plain object のときだけ record として扱う。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** request body など client 起因の 400 に変換する error。 */
class BadRequestError extends Error {
  override name = "BadRequestError";
}
