const CANDIDATE_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"];
const BASE64_CHUNK_SIZE = 0x8000;

/**
 * マイク録音（`getUserMedia` + `MediaRecorder`）が使える環境かどうか。
 *
 * `navigator.mediaDevices` は secure context（`https://` または `http://localhost` /
 * `http://127.0.0.1`）でしか存在しない。ネットワークIP経由の `http://` アクセスなどでは
 * `undefined` になり、それを直接呼ぶと分かりにくいブラウザ内部の TypeError になる。
 */
export function isMediaRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export type RecordedAudio = {
  blob: Blob;
  mimeType: string;
};

export type AudioRecorderHandle = {
  stop: () => Promise<RecordedAudio>;
};

/** MediaRecorder で録音を開始する。mic 権限の取得（getUserMedia）は呼び出し側の責務。 */
export function startAudioRecording(stream: MediaStream): AudioRecorderHandle {
  const mimeType = preferredMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: BlobPart[] = [];

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  recorder.start();

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.addEventListener(
          "stop",
          () => {
            const type = recorder.mimeType || mimeType || "audio/webm";
            resolve({ blob: new Blob(chunks, { type }), mimeType: type });
          },
          { once: true },
        );
        recorder.stop();
      }),
  };
}

function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  return CANDIDATE_MIME_TYPES.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

/**
 * Blob を base64 文字列に変換する（BFF `/api/voice-recordings` の audioBase64 として送るため）。
 * `FileReader` はテスト環境（Bun）に存在しないため、`Blob.arrayBuffer()` + `btoa` だけで完結させる。
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return uint8ArrayToBase64(bytes);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
