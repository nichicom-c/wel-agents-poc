const VOICE_RECORDINGS_ENDPOINT = "/api/voice-recordings";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** BFF `/api/voice-recordings*` の文字起こし job 状態。Amazon Transcribe の状態をそのまま写像する。 */
export const VOICE_RECORDING_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;

export type VoiceRecordingStatus = (typeof VOICE_RECORDING_STATUSES)[number];

function isVoiceRecordingStatus(value: unknown): value is VoiceRecordingStatus {
  return (
    typeof value === "string" &&
    (VOICE_RECORDING_STATUSES as readonly string[]).includes(value)
  );
}

export type PostVoiceRecordingOptions = {
  audioBase64: string;
  mimeType: string;
  fetchFn?: FetchFn;
};

export type VoiceRecordingResult = {
  recordingId: string;
  status: VoiceRecordingStatus;
};

/** 音声原本を BFF `POST /api/voice-recordings` へ送り、文字起こし job を開始する。 */
export async function postVoiceRecording({
  audioBase64,
  mimeType,
  fetchFn = fetch,
}: PostVoiceRecordingOptions): Promise<VoiceRecordingResult> {
  if (!audioBase64) {
    throw new Error("audioBase64 is required");
  }

  const response = await fetchFn(VOICE_RECORDINGS_ENDPOINT, {
    body: JSON.stringify({ audioBase64, mimeType }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  const recordingId = trimmedText(payload.recordingId);
  if (!recordingId) {
    throw new Error("recordingId missing from response");
  }

  return {
    recordingId,
    status: isVoiceRecordingStatus(payload.status) ? payload.status : "queued",
  };
}

export type GetVoiceRecordingStatusOptions = {
  recordingId: string;
  fetchFn?: FetchFn;
};

export type VoiceRecordingStatusResult = {
  error?: string;
  recordingId: string;
  status: VoiceRecordingStatus;
  transcript?: string;
};

/** BFF `GET /api/voice-recordings/:recordingId` を呼び、job 状態と transcript を取得する。 */
export async function getVoiceRecordingStatus({
  recordingId,
  fetchFn = fetch,
}: GetVoiceRecordingStatusOptions): Promise<VoiceRecordingStatusResult> {
  const response = await fetchFn(
    `${VOICE_RECORDINGS_ENDPOINT}/${encodeURIComponent(recordingId)}`,
    { method: "GET" },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  const transcript = trimmedText(payload.transcript);
  const error = trimmedText(payload.error);

  return {
    recordingId: trimmedText(payload.recordingId) || recordingId,
    status: isVoiceRecordingStatus(payload.status) ? payload.status : "queued",
    ...(transcript ? { transcript } : {}),
    ...(error ? { error } : {}),
  };
}

export type PatchVoiceRecordingTranscriptOptions = {
  editedTranscript: string;
  fetchFn?: FetchFn;
  recordingId: string;
};

export type EditVoiceRecordingTranscriptResult = {
  editedTranscript: string;
  recordingId: string;
};

/** 利用者が確認・編集した transcript を BFF `PATCH /api/voice-recordings/:recordingId` へ保存する。 */
export async function patchVoiceRecordingTranscript({
  editedTranscript,
  fetchFn = fetch,
  recordingId,
}: PatchVoiceRecordingTranscriptOptions): Promise<EditVoiceRecordingTranscriptResult> {
  const cleanedTranscript = editedTranscript.trim();
  if (!cleanedTranscript) {
    throw new Error("editedTranscript is required");
  }

  const response = await fetchFn(
    `${VOICE_RECORDINGS_ENDPOINT}/${encodeURIComponent(recordingId)}`,
    {
      body: JSON.stringify({ editedTranscript: cleanedTranscript }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  return {
    editedTranscript:
      trimmedText(payload.editedTranscript) || cleanedTranscript,
    recordingId: trimmedText(payload.recordingId) || recordingId,
  };
}

function errorMessage(
  payload: Record<string, unknown>,
  statusCode: number,
): string {
  return (
    trimmedText(payload.error) ||
    trimmedText(payload.message) ||
    `HTTP ${statusCode}`
  );
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

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
