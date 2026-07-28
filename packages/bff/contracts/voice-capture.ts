/** Voice Capture (issue #7) の文字起こし job 状態。Amazon Transcribe の状態をそのまま写像する。 */
export const VOICE_RECORDING_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;

export type VoiceRecordingStatus = (typeof VOICE_RECORDING_STATUSES)[number];

export function isVoiceRecordingStatus(
  value: unknown,
): value is VoiceRecordingStatus {
  return (
    typeof value === "string" &&
    (VOICE_RECORDING_STATUSES as readonly string[]).includes(value)
  );
}

/** mimeType → Amazon Transcribe MediaFormat の対応表。対応外の mimeType は undefined。 */
const MEDIA_FORMAT_BY_MIME_TYPE: Record<string, string> = {
  "audio/flac": "flac",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "mp4",
  "audio/x-wav": "wav",
};

/** browser が渡す mimeType を Amazon Transcribe の MediaFormat へ変換する。未対応なら undefined。 */
export function mediaFormatFromMimeType(mimeType: string): string | undefined {
  return MEDIA_FORMAT_BY_MIME_TYPE[mimeType.toLowerCase().trim()];
}

export type CreateVoiceRecordingResult = {
  recordingId: string;
  status: VoiceRecordingStatus;
};

export type VoiceRecordingStatusResult = {
  error?: string;
  recordingId: string;
  status: VoiceRecordingStatus;
  transcript?: string;
};

export type EditVoiceRecordingTranscriptResult = {
  editedTranscript: string;
  recordingId: string;
};
