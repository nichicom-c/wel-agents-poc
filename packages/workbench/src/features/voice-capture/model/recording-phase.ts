import type { VoiceRecordingStatus } from "../api/voice-capture.ts";

/**
 * Voice Capture 画面の client 側状態。録音/アップロード操作の段階（idle/recording/recorded/
 * uploading）と、アップロード後は BFF から返る `VoiceRecordingStatus` をそのまま状態として使う。
 */
export type RecordingPhase =
  | "idle"
  | "recording"
  | "recorded"
  | "uploading"
  | VoiceRecordingStatus;

/** 文字起こしの結果が確定した（transcript を編集できる、または手動入力へ切り替えられる）か。 */
export function isSettledPhase(phase: RecordingPhase): boolean {
  return phase === "succeeded" || phase === "failed";
}

/** BFF への polling を続けるべきか（job がまだ終わっていないか）。 */
export function isPollingPhase(phase: RecordingPhase): boolean {
  return phase === "queued" || phase === "running";
}
