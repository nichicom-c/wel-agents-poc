import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  GetTranscriptionJobCommand,
  type LanguageCode,
  type MediaFormat,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from "@aws-sdk/client-transcribe";

import type { VoiceRecordingStatusResult } from "../contracts/voice-capture.ts";

const JOB_NAME_PREFIX = "voice-capture-";

/** Voice Capture 用 S3 bucket / Transcribe region などの共通設定。 */
export type VoiceCaptureStoreConfig = {
  bucket: string;
  /**
   * Amazon Transcribe が StartTranscriptionJob で assume する IAM role の ARN
   * （JobExecutionSettings.DataAccessRoleArn）。Forward Access Sessions（呼び出し元の
   * IAM 権限をそのまま使う既定の仕組み）だけでは S3 アクセスが `BadRequestException`
   * になるアカウントがあるため、明示的に渡す。未設定なら JobExecutionSettings を省略し
   * 既定の Forward Access Sessions に任せる。
   */
  dataAccessRoleArn?: string;
  languageCode: string;
  region: string;
};

export type VoiceCaptureStoreDeps = {
  s3Client?: S3Client;
  transcribeClient?: TranscribeClient;
};

export type UploadRecordingInput = {
  audioBytes: Uint8Array;
  mediaFormat: string;
  recordingId: string;
};

export type RecordingIdInput = {
  recordingId: string;
};

export type SaveEditedTranscriptInput = {
  editedTranscript: string;
  recordingId: string;
};

/** 音声原本を S3 へ保存し、Amazon Transcribe の非同期文字起こし job を開始する。 */
export async function uploadRecordingAndStartTranscription(
  config: VoiceCaptureStoreConfig,
  input: UploadRecordingInput,
  deps: VoiceCaptureStoreDeps = {},
): Promise<void> {
  const s3 = s3Client(config, deps);
  const key = originalKey(input.recordingId, input.mediaFormat);

  await s3.send(
    new PutObjectCommand({
      Body: input.audioBytes,
      Bucket: config.bucket,
      Key: key,
    }),
  );

  const transcribe = transcribeClient(config, deps);
  await transcribe.send(
    new StartTranscriptionJobCommand({
      JobExecutionSettings: config.dataAccessRoleArn
        ? {
            AllowDeferredExecution: false,
            DataAccessRoleArn: config.dataAccessRoleArn,
          }
        : undefined,
      LanguageCode: config.languageCode as LanguageCode,
      Media: { MediaFileUri: `s3://${config.bucket}/${key}` },
      MediaFormat: input.mediaFormat as MediaFormat,
      OutputBucketName: config.bucket,
      OutputKey: transcriptRawKey(input.recordingId),
      TranscriptionJobName: jobName(input.recordingId),
    }),
  );
}

/** Transcribe job の状態を取得し、完了していれば S3 から transcript 本文を読み出す。 */
export async function getTranscriptionJobStatus(
  config: VoiceCaptureStoreConfig,
  input: RecordingIdInput,
  deps: VoiceCaptureStoreDeps = {},
): Promise<VoiceRecordingStatusResult> {
  const transcribe = transcribeClient(config, deps);
  const output = await transcribe.send(
    new GetTranscriptionJobCommand({
      TranscriptionJobName: jobName(input.recordingId),
    }),
  );
  const job = output.TranscriptionJob;

  if (job?.TranscriptionJobStatus === "COMPLETED") {
    const transcript = await readTranscript(config, input.recordingId, deps);
    return { recordingId: input.recordingId, status: "succeeded", transcript };
  }

  if (job?.TranscriptionJobStatus === "FAILED") {
    return {
      error: job.FailureReason || "transcription failed",
      recordingId: input.recordingId,
      status: "failed",
    };
  }

  if (job?.TranscriptionJobStatus === "IN_PROGRESS") {
    return { recordingId: input.recordingId, status: "running" };
  }

  return { recordingId: input.recordingId, status: "queued" };
}

/** 利用者が確認・編集した transcript を S3 へ保存する（正式記録へ反映する前の確認済み記録）。 */
export async function saveEditedTranscript(
  config: VoiceCaptureStoreConfig,
  input: SaveEditedTranscriptInput,
  deps: VoiceCaptureStoreDeps = {},
): Promise<void> {
  const s3 = s3Client(config, deps);
  await s3.send(
    new PutObjectCommand({
      Body: input.editedTranscript,
      Bucket: config.bucket,
      ContentType: "text/plain; charset=utf-8",
      Key: editedTranscriptKey(input.recordingId),
    }),
  );
}

async function readTranscript(
  config: VoiceCaptureStoreConfig,
  recordingId: string,
  deps: VoiceCaptureStoreDeps,
): Promise<string> {
  const s3 = s3Client(config, deps);
  const output = await s3.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: transcriptRawKey(recordingId),
    }),
  );
  const body = await output.Body?.transformToString("utf-8");

  if (!body) {
    return "";
  }

  const parsed = JSON.parse(body);
  const transcript = parsed?.results?.transcripts?.[0]?.transcript;
  return typeof transcript === "string" ? transcript : "";
}

function s3Client(
  config: VoiceCaptureStoreConfig,
  deps: VoiceCaptureStoreDeps,
): S3Client {
  return deps.s3Client ?? new S3Client({ region: config.region });
}

function transcribeClient(
  config: VoiceCaptureStoreConfig,
  deps: VoiceCaptureStoreDeps,
): TranscribeClient {
  return (
    deps.transcribeClient ?? new TranscribeClient({ region: config.region })
  );
}

function originalKey(recordingId: string, mediaFormat: string): string {
  return `recordings/${recordingId}/original.${mediaFormat}`;
}

function transcriptRawKey(recordingId: string): string {
  return `recordings/${recordingId}/transcript-raw.json`;
}

function editedTranscriptKey(recordingId: string): string {
  return `recordings/${recordingId}/transcript-edited.txt`;
}

function jobName(recordingId: string): string {
  return `${JOB_NAME_PREFIX}${recordingId}`;
}
