import { describe, expect, test } from "bun:test";

import {
  getVoiceRecordingStatus,
  patchVoiceRecordingTranscript,
  postVoiceRecording,
} from "./voice-capture.ts";

describe("postVoiceRecording", () => {
  test("audioBase64 / mimeType を POST body に含めて呼ぶ", async () => {
    let capturedBody: unknown;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = JSON.parse(String(init?.body));
      return Response.json({
        recordingId: "rec-1",
        status: "queued",
      });
    };

    const result = await postVoiceRecording({
      audioBase64: "YWJj",
      mimeType: "audio/webm",
      fetchFn,
    });

    expect(capturedBody).toEqual({
      audioBase64: "YWJj",
      mimeType: "audio/webm",
    });
    expect(result).toEqual({ recordingId: "rec-1", status: "queued" });
  });

  test("audioBase64 が空なら呼ばずに throw する", async () => {
    await expect(
      postVoiceRecording({
        audioBase64: "",
        mimeType: "audio/webm",
        fetchFn: async () => {
          throw new Error("must not be called");
        },
      }),
    ).rejects.toThrow("audioBase64 is required");
  });

  test("非 2xx は error メッセージを throw する", async () => {
    const fetchFn = async () =>
      Response.json({ error: "unsupported mimeType" }, { status: 400 });

    await expect(
      postVoiceRecording({ audioBase64: "YWJj", mimeType: "x", fetchFn }),
    ).rejects.toThrow("unsupported mimeType");
  });
});

describe("getVoiceRecordingStatus", () => {
  test("status / transcript を取得する", async () => {
    const fetchFn = async () =>
      Response.json({
        recordingId: "rec-1",
        status: "succeeded",
        transcript: "文字起こし結果",
      });

    const result = await getVoiceRecordingStatus({
      recordingId: "rec-1",
      fetchFn,
    });

    expect(result).toEqual({
      recordingId: "rec-1",
      status: "succeeded",
      transcript: "文字起こし結果",
    });
  });

  test("failed 時は error を含める", async () => {
    const fetchFn = async () =>
      Response.json({
        recordingId: "rec-1",
        status: "failed",
        error: "unsupported audio",
      });

    const result = await getVoiceRecordingStatus({
      recordingId: "rec-1",
      fetchFn,
    });

    expect(result).toEqual({
      recordingId: "rec-1",
      status: "failed",
      error: "unsupported audio",
    });
  });

  test("不正な status は queued 扱いにする", async () => {
    const fetchFn = async () =>
      Response.json({ recordingId: "rec-1", status: "unknown" });

    const result = await getVoiceRecordingStatus({
      recordingId: "rec-1",
      fetchFn,
    });

    expect(result.status).toBe("queued");
  });
});

describe("patchVoiceRecordingTranscript", () => {
  test("編集済み transcript を PATCH body に含めて呼ぶ", async () => {
    let capturedBody: unknown;
    let capturedMethod: string | undefined;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = JSON.parse(String(init?.body));
      capturedMethod = init?.method;
      return Response.json({
        recordingId: "rec-1",
        editedTranscript: "編集後",
      });
    };

    const result = await patchVoiceRecordingTranscript({
      recordingId: "rec-1",
      editedTranscript: "  編集後  ",
      fetchFn,
    });

    expect(capturedMethod).toBe("PATCH");
    expect(capturedBody).toEqual({ editedTranscript: "編集後" });
    expect(result).toEqual({
      recordingId: "rec-1",
      editedTranscript: "編集後",
    });
  });

  test("空文字は呼ばずに throw する", async () => {
    await expect(
      patchVoiceRecordingTranscript({
        recordingId: "rec-1",
        editedTranscript: "   ",
        fetchFn: async () => {
          throw new Error("must not be called");
        },
      }),
    ).rejects.toThrow("editedTranscript is required");
  });
});
