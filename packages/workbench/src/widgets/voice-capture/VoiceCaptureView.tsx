import {
  MicIcon,
  RotateCcwIcon,
  SendIcon,
  SquareIcon,
  UploadIcon,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type AudioRecorderHandle,
  blobToBase64,
  getVoiceRecordingStatus,
  isMediaRecordingSupported,
  isPollingPhase,
  patchVoiceRecordingTranscript,
  postVoiceRecording,
  type RecordingPhase,
  startAudioRecording,
} from "../../features/voice-capture/index.ts";

const POLL_INTERVAL_MS = 3000;
const UNSUPPORTED_RECORDING_MESSAGE =
  "この接続では録音を利用できません（マイク録音には https:// または localhost/127.0.0.1 でのアクセスが必要です）。音声ファイルをアップロードしてください。";

const PHASE_LABELS: Record<RecordingPhase, string> = {
  idle: "未録音",
  recording: "録音中…",
  recorded: "録音済み（未アップロード）",
  uploading: "アップロード中…",
  queued: "文字起こし待機中",
  running: "文字起こし中…",
  succeeded: "文字起こし完了",
  failed: "文字起こし失敗",
};

export type VoiceCaptureViewProps = {
  /** 編集済み transcript（または手動入力テキスト）を SOAP Studio へ引き継ぐ。 */
  onSendToSoapStudio: (text: string, sourceLabel: string) => void;
};

/**
 * Voice Capture（issue #7）の画面。音声原本の録音/アップロード、非同期文字起こしの状態確認、
 * transcript の編集、SOAP Studio への引き継ぎ、失敗時の手動テキスト入力フォールバックを扱う。
 */
export function VoiceCaptureView({
  onSendToSoapStudio,
}: VoiceCaptureViewProps) {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [manualText, setManualText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [canRecord] = useState(() => isMediaRecordingSupported());

  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!recordingId || !isPollingPhase(phase)) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const result = await getVoiceRecordingStatus({ recordingId });
        setPhase(result.status);
        if (result.transcript) {
          setTranscript(result.transcript);
        }
        if (result.error) {
          setErrorMessage(result.error);
        }
      } catch (caught) {
        setPhase("failed");
        setErrorMessage(
          caught instanceof Error ? caught.message : String(caught),
        );
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [recordingId, phase]);

  function resetRecording() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setAudioBlob(null);
    setMimeType("");
    setPreviewUrl("");
    setRecordingId(null);
    setTranscript("");
    setManualText("");
    setErrorMessage("");
    setPhase("idle");
  }

  async function handleStartRecording() {
    if (!canRecord) {
      setErrorMessage(UNSUPPORTED_RECORDING_MESSAGE);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      recorderRef.current = startAudioRecording(stream);
      setErrorMessage("");
      setPhase("recording");
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "マイクを利用できませんでした",
      );
    }
  }

  async function handleStopRecording() {
    const handle = recorderRef.current;
    if (!handle) {
      return;
    }
    const { blob, mimeType: recordedMimeType } = await handle.stop();
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    recorderRef.current = null;
    streamRef.current = null;
    setAudioBlob(blob);
    setMimeType(recordedMimeType);
    setPreviewUrl(URL.createObjectURL(blob));
    setPhase("recorded");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setAudioBlob(file);
    setMimeType(file.type);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMessage("");
    setPhase("recorded");
  }

  async function handleUpload() {
    if (!audioBlob) {
      return;
    }
    setPhase("uploading");
    setErrorMessage("");
    try {
      const audioBase64 = await blobToBase64(audioBlob);
      const result = await postVoiceRecording({ audioBase64, mimeType });
      setRecordingId(result.recordingId);
      setPhase(result.status);
    } catch (caught) {
      setPhase("failed");
      setErrorMessage(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  }

  async function handleSendTranscript() {
    const text = transcript.trim();
    if (!text || !recordingId) {
      return;
    }
    try {
      await patchVoiceRecordingTranscript({
        editedTranscript: text,
        recordingId,
      });
    } catch {
      // 保存に失敗しても SOAP Studio への引き継ぎ自体は妨げない（利用者はすでに内容を確認済み）。
    }
    onSendToSoapStudio(text, `音声記録 ${recordingId}`);
  }

  function handleSendManualText() {
    const text = manualText.trim();
    if (!text) {
      return;
    }
    onSendToSoapStudio(
      text,
      recordingId ? `音声記録 ${recordingId}（手動入力）` : "手動入力",
    );
  }

  const isBusy =
    phase === "recording" || phase === "uploading" || isPollingPhase(phase);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-std-24B-150">Voice Capture</h2>
        <p className="text-muted-foreground text-std-16N-170">
          面談・訪問・電話・会議の音声原本を保存し、文字起こし結果を確認・編集して
          SOAP Studio へ引き継ぐ作業画面
        </p>
      </div>

      <section aria-label="音声入力">
        <FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            {phase === "recording" ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleStopRecording()}
              >
                <SquareIcon data-icon="inline-start" />
                録音停止
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isBusy || !canRecord}
                title={canRecord ? undefined : UNSUPPORTED_RECORDING_MESSAGE}
                onClick={() => void handleStartRecording()}
              >
                <MicIcon data-icon="inline-start" />
                録音開始
              </Button>
            )}
          </div>

          <Field>
            <FieldLabel htmlFor="voice-capture-file">
              音声ファイルを選択
            </FieldLabel>
            <Input
              id="voice-capture-file"
              type="file"
              accept="audio/*"
              disabled={isBusy}
              onChange={handleFileChange}
            />
          </Field>

          {!canRecord ? (
            <Alert>
              <AlertDescription>
                {UNSUPPORTED_RECORDING_MESSAGE}
              </AlertDescription>
            </Alert>
          ) : null}

          {previewUrl ? (
            // biome-ignore lint/a11y/useMediaCaption: 録音/アップロード直後のプレビュー用途で字幕データは存在しない。
            <audio className="w-full" controls src={previewUrl} />
          ) : null}

          <p
            className="font-bold text-muted-foreground text-std-16N-170"
            role="status"
            aria-live="polite"
          >
            状態: {PHASE_LABELS[phase]}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={!audioBlob || phase !== "recorded"}
              onClick={() => void handleUpload()}
            >
              <UploadIcon data-icon="inline-start" />
              アップロードして文字起こし開始
            </Button>
            {phase !== "idle" ? (
              <Button type="button" variant="outline" onClick={resetRecording}>
                <RotateCcwIcon data-icon="inline-start" />
                やり直す
              </Button>
            ) : null}
          </div>

          {errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </section>

      {phase === "succeeded" ? (
        <section aria-label="文字起こし結果">
          <Card>
            <CardHeader>
              <CardTitle>文字起こし結果（編集可）</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                className="min-h-48"
                aria-label="文字起こし結果"
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
              />
              <div>
                <Button
                  type="button"
                  disabled={!transcript.trim()}
                  onClick={() => void handleSendTranscript()}
                >
                  <SendIcon data-icon="inline-start" />
                  SOAP Studio へ送る
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {phase === "failed" ? (
        <section aria-label="手動テキスト入力">
          <Card>
            <CardHeader>
              <CardTitle>
                文字起こしに失敗しました。手動でテキストを入力してください
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                className="min-h-48"
                aria-label="手動入力テキスト"
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
              />
              <div>
                <Button
                  type="button"
                  disabled={!manualText.trim()}
                  onClick={handleSendManualText}
                >
                  <SendIcon data-icon="inline-start" />
                  SOAP Studio へ送る
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
