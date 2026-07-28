import { randomUUID } from "node:crypto";

import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import {
  type CreateVoiceRecordingResult,
  type EditVoiceRecordingTranscriptResult,
  mediaFormatFromMimeType,
  type VoiceRecordingStatusResult,
} from "../contracts/voice-capture.ts";

const RECORDING_PATH_PATTERN = /^\/api\/voice-recordings\/([^/]+)$/;
const COLLECTION_PATH = "/api/voice-recordings";

/** BFF core の依存。adapter ごとに S3 / Transcribe 呼び出しの実装を注入する。 */
export type HandleVoiceRecordingOptions = {
  /** 音声原本を保存し、Transcribe の非同期 job を開始する。 */
  createRecording: (input: {
    audioBytes: Uint8Array;
    mediaFormat: string;
    recordingId: string;
  }) => Promise<void>;
  /** 生成する recordingId（テスト用。省略時は randomUUID）。 */
  createRecordingId?: () => string;
  /** Transcribe job の状態と、完了していれば transcript を取得する。 */
  getRecordingStatus: (input: {
    recordingId: string;
  }) => Promise<VoiceRecordingStatusResult>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** 利用者が確認・編集した transcript を保存する。 */
  saveEditedTranscript: (input: {
    editedTranscript: string;
    recordingId: string;
  }) => Promise<void>;
  /** Voice Capture 用 S3 bucket が設定済みかどうか。未設定なら 503 を返す。 */
  voiceCaptureBucket?: string;
};

/**
 * Voice Capture（issue #7）の BFF handler。
 *
 * 音声原本の保存 + 文字起こし job 開始（POST）、job 状態 / transcript の取得（GET）、
 * 利用者が確認・編集した transcript の保存（PATCH）の 3 操作を 1 つの handler にまとめる
 * （recordingId が S3 key prefix と Transcribe job name を兼ねるため、状態管理用の DB は持たない）。
 */
export async function handleVoiceRecordingRequest(
  request: BffHttpRequest,
  options: HandleVoiceRecordingOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isVoiceRecordingPath(request.path)) {
    return response(204, {});
  }

  if (!isVoiceRecordingPath(request.path)) {
    return response(404, { error: "not found" });
  }

  if (!options.voiceCaptureBucket) {
    return response(503, { error: "Voice Capture is not configured" });
  }

  try {
    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleCreate(request, options);
    }

    const recordingId = recordingIdFromPath(request.path);
    if (recordingId && request.method === "GET") {
      return await handleGetStatus(recordingId, options);
    }
    if (recordingId && request.method === "PATCH") {
      return await handleEditTranscript(request, recordingId, options);
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("voice recording request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(statusCodeForError(error), {
      error: "voice recording request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  options: HandleVoiceRecordingOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);
  const audioBase64 = textField(body.audioBase64);
  const mimeType = textField(body.mimeType);

  if (!audioBase64) {
    throw new BadRequestError("audioBase64 is required");
  }
  if (!mimeType) {
    throw new BadRequestError("mimeType is required");
  }

  const mediaFormat = mediaFormatFromMimeType(mimeType);
  if (!mediaFormat) {
    throw new BadRequestError(`unsupported mimeType: ${mimeType}`);
  }

  const audioBytes = decodeBase64(audioBase64);
  const recordingId = (options.createRecordingId ?? randomUUID)();

  await options.createRecording({ audioBytes, mediaFormat, recordingId });

  const result: CreateVoiceRecordingResult = {
    recordingId,
    status: "queued",
  };
  return response(200, result);
}

async function handleGetStatus(
  recordingId: string,
  options: HandleVoiceRecordingOptions,
): Promise<BffHttpResponse> {
  const result = await options.getRecordingStatus({ recordingId });
  return response(200, result);
}

async function handleEditTranscript(
  request: BffHttpRequest,
  recordingId: string,
  options: HandleVoiceRecordingOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);
  const editedTranscript = textField(body.editedTranscript);

  if (!editedTranscript) {
    throw new BadRequestError("editedTranscript is required");
  }

  await options.saveEditedTranscript({ editedTranscript, recordingId });

  const result: EditVoiceRecordingTranscriptResult = {
    editedTranscript,
    recordingId,
  };
  return response(200, result);
}

function isVoiceRecordingPath(path: string): boolean {
  return path === COLLECTION_PATH || RECORDING_PATH_PATTERN.test(path);
}

function recordingIdFromPath(path: string): string | undefined {
  const match = RECORDING_PATH_PATTERN.exec(path);
  const recordingId = match?.[1];
  return recordingId ? decodeURIComponent(recordingId) : undefined;
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

function decodeBase64(value: string): Uint8Array {
  try {
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch {
    throw new BadRequestError("audioBase64 must be valid base64");
  }
}

/** Amazon Transcribe が未知の job name に対して投げる例外は 404 として扱う。 */
function statusCodeForError(error: unknown): number {
  if (error instanceof Error && error.name === "BadRequestException") {
    return 404;
  }
  return 502;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** request body など client 起因の 400 に変換する error。 */
class BadRequestError extends Error {
  override name = "BadRequestError";
}
