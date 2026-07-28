import { describe, expect, test } from "bun:test";

import { blobToBase64, isMediaRecordingSupported } from "./audio-recorder.ts";

describe("isMediaRecordingSupported", () => {
  test("navigator が無い環境（bun:test）では false を返す", () => {
    expect(isMediaRecordingSupported()).toBe(false);
  });
});

describe("blobToBase64", () => {
  test("Blob の内容を base64 に変換する", async () => {
    const blob = new Blob(["hello"], { type: "audio/webm" });

    const base64 = await blobToBase64(blob);

    expect(base64).toBe(Buffer.from("hello").toString("base64"));
  });

  test("chunk 境界をまたぐ大きな Blob も変換できる", async () => {
    const bytes = new Uint8Array(0x8000 + 10).fill(65);
    const blob = new Blob([bytes], { type: "audio/webm" });

    const base64 = await blobToBase64(blob);

    expect(base64).toBe(Buffer.from(bytes).toString("base64"));
  });
});
