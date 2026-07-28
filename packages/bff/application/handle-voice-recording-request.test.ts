import { describe, expect, test } from "bun:test";

import { handleVoiceRecordingRequest } from "./handle-voice-recording-request.ts";

const RECORDING_ID = "voice-00000000-0000-4000-8000-000000000000";

function options(
  overrides: Partial<Parameters<typeof handleVoiceRecordingRequest>[1]> = {},
) {
  return {
    createRecording: async () => {
      throw new Error("must not be called");
    },
    createRecordingId: () => RECORDING_ID,
    getRecordingStatus: async () => {
      throw new Error("must not be called");
    },
    saveEditedTranscript: async () => {
      throw new Error("must not be called");
    },
    voiceCaptureBucket: "test-bucket",
    ...overrides,
  };
}

describe("handleVoiceRecordingRequest", () => {
  test("POST は音声を保存し queued を返す", async () => {
    let created: unknown;

    const response = await handleVoiceRecordingRequest(
      {
        body: JSON.stringify({
          audioBase64: Buffer.from("audio-bytes").toString("base64"),
          mimeType: "audio/webm",
        }),
        method: "POST",
        path: "/api/voice-recordings",
      },
      options({
        createRecording: async (input) => {
          created = input;
        },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      recordingId: RECORDING_ID,
      status: "queued",
    });
    expect(created).toEqual({
      audioBytes: new Uint8Array(Buffer.from("audio-bytes")),
      mediaFormat: "webm",
      recordingId: RECORDING_ID,
    });
  });

  test("audioBase64 欠落は 400 にする", async () => {
    const response = await handleVoiceRecordingRequest(
      {
        body: JSON.stringify({ mimeType: "audio/webm" }),
        method: "POST",
        path: "/api/voice-recordings",
      },
      options(),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "audioBase64 is required",
    });
  });

  test("未対応の mimeType は 400 にする", async () => {
    const response = await handleVoiceRecordingRequest(
      {
        body: JSON.stringify({
          audioBase64: Buffer.from("x").toString("base64"),
          mimeType: "video/mp4",
        }),
        method: "POST",
        path: "/api/voice-recordings",
      },
      options(),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "unsupported mimeType: video/mp4",
    });
  });

  test("GET は job 状態と transcript を返す", async () => {
    const response = await handleVoiceRecordingRequest(
      { method: "GET", path: `/api/voice-recordings/${RECORDING_ID}` },
      options({
        getRecordingStatus: async ({ recordingId }) => ({
          recordingId,
          status: "succeeded",
          transcript: "文字起こし結果",
        }),
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      recordingId: RECORDING_ID,
      status: "succeeded",
      transcript: "文字起こし結果",
    });
  });

  test("PATCH は編集済み transcript を保存する", async () => {
    let saved: unknown;

    const response = await handleVoiceRecordingRequest(
      {
        body: JSON.stringify({ editedTranscript: " 編集後の文章 " }),
        method: "PATCH",
        path: `/api/voice-recordings/${RECORDING_ID}`,
      },
      options({
        saveEditedTranscript: async (input) => {
          saved = input;
        },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      recordingId: RECORDING_ID,
      editedTranscript: "編集後の文章",
    });
    expect(saved).toEqual({
      editedTranscript: "編集後の文章",
      recordingId: RECORDING_ID,
    });
  });

  test("editedTranscript 欠落は 400 にする", async () => {
    const response = await handleVoiceRecordingRequest(
      {
        body: JSON.stringify({}),
        method: "PATCH",
        path: `/api/voice-recordings/${RECORDING_ID}`,
      },
      options(),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "editedTranscript is required",
    });
  });

  test("store が例外を投げたら 502 にする", async () => {
    const response = await handleVoiceRecordingRequest(
      { method: "GET", path: `/api/voice-recordings/${RECORDING_ID}` },
      options({
        getRecordingStatus: async () => {
          throw new Error("transcribe unavailable");
        },
      }),
    );

    expect(response.statusCode).toBe(502);
  });

  test("OPTIONS は 204 を返す", async () => {
    const response = await handleVoiceRecordingRequest(
      { method: "OPTIONS", path: "/api/voice-recordings" },
      options(),
    );

    expect(response.statusCode).toBe(204);
  });

  test("未知の path/method は 404 にする", async () => {
    const response = await handleVoiceRecordingRequest(
      { method: "DELETE", path: `/api/voice-recordings/${RECORDING_ID}` },
      options(),
    );

    expect(response.statusCode).toBe(404);
  });

  test("bucket 未設定は 503 にする", async () => {
    const response = await handleVoiceRecordingRequest(
      { method: "GET", path: `/api/voice-recordings/${RECORDING_ID}` },
      options({ voiceCaptureBucket: undefined }),
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "Voice Capture is not configured",
    });
  });
});
