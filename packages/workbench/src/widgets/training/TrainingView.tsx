import { SendIcon, SkipForwardIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { DemoRoleSwitcher } from "@/components/demo-role-switcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Message,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  listMaterials,
  type Material,
  materialTypeLabel,
} from "../../features/admin/index.ts";
import {
  appendAssistantMessage,
  appendUserMessage,
  type ChatMessage,
  latestAssistantSuggestions,
  type MaterialChatMaterial,
  MessageMarkdown,
  postMaterialChat,
} from "../../features/chat/index.ts";
import { tagLabel, useMasters } from "../../features/masters/index.ts";
import {
  canViewTraining,
  TRAINING_DEMO_ROLES,
  type TrainingDemoRole,
  trainingDemoRoleLabel,
} from "../../features/training/index.ts";

type LoadStatus = "idle" | "loading" | "error";

export function TrainingView() {
  const [role, setRole] = useState<TrainingDemoRole>("trainee");
  const canView = canViewTraining(role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-std-24B-150">Training</h2>
        <p className="text-muted-foreground text-std-16N-170">
          公開済み教材についての教材チャット
        </p>
      </div>

      <DemoRoleSwitcher
        idPrefix="training-role"
        label={trainingDemoRoleLabel}
        roles={TRAINING_DEMO_ROLES}
        value={role}
        onValueChange={setRole}
      />

      {canView ? (
        <MaterialChatPanel />
      ) : (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            この画面を利用する権限がありません。ロールを「新人保健師」「指導者」「管理者」に切り替えてください。
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * 公開済み教材(status: published)を一覧し、選択した教材の指導のポイントを1件ずつ
 * 段階式ガイド形式で対話する(`soap_gaps_chat` の不足確認キューと同じ役割分担: 「次に
 * どのポイントを扱うか」はこの画面側がキューとして決定的に管理し、BFF `/api/material-chat`
 * 経由の専用 agent は渡された1件を会話的に深掘りするだけに専念する)。AgentCore Memory は
 * 使わず、ここで保持している `messages` をそのまま毎回 `history` として送り直す。
 */
function MaterialChatPanel() {
  const masters = useMasters();
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(
    null,
  );
  const [resolvedPointIndices, setResolvedPointIndices] = useState<Set<number>>(
    new Set(),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatStatus, setChatStatus] = useState<LoadStatus>("idle");
  const [chatError, setChatError] = useState("");
  const [inputText, setInputText] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    listMaterials({ publicationStatus: "published" })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setMaterials(result);
        setStatus("idle");
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus("error");
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const teachingPoints = selectedMaterial?.teachingPoints ?? [];
  const activePointIndex = teachingPoints.findIndex(
    (_, index) => !resolvedPointIndices.has(index),
  );

  /**
   * 教材チャットの1ターンを実行する。resolved になれば次の未解決の指導のポイントを
   * 自動で提示し続ける(AI主導)。すべて解決したら完了メッセージを表示し、以降は
   * 教材全体についての自由対話に切り替わる。`points`/`resolvedIndices` は React state の
   * 非同期反映に左右されないよう、呼び出し元から明示的に受け取って引き回す
   * (`SoapStudioView` の `runChatTurn` と同じ方針)。
   */
  async function runChatTurn(
    material: Material,
    points: string[],
    pointIndex: number | undefined,
    priorMessages: ChatMessage[],
    resolvedIndices: Set<number>,
    message?: string,
  ) {
    setChatStatus("loading");
    setChatError("");
    const displayMessages = message
      ? appendUserMessage(priorMessages, message)
      : priorMessages;
    setMessages(displayMessages);
    try {
      const result = await postMaterialChat({
        history: priorMessages.map((entry) => ({
          role: entry.role,
          text: entry.text,
        })),
        material: materialChatMaterial(material),
        message,
        teachingPoint:
          pointIndex !== undefined ? points[pointIndex] : undefined,
      });
      const finalMessages = appendAssistantMessage(
        displayMessages,
        result.message,
        result.suggestions,
      );
      setMessages(finalMessages);

      if (!result.resolved || pointIndex === undefined) {
        setChatStatus("idle");
        return;
      }

      const nextResolvedIndices = new Set(resolvedIndices);
      nextResolvedIndices.add(pointIndex);
      setResolvedPointIndices(nextResolvedIndices);

      const nextPointIndex = points.findIndex(
        (_, index) => !nextResolvedIndices.has(index),
      );
      if (nextPointIndex >= 0) {
        await runChatTurn(
          material,
          points,
          nextPointIndex,
          finalMessages,
          nextResolvedIndices,
        );
        return;
      }

      setMessages((prev) =>
        appendAssistantMessage(
          prev,
          "この教材の指導のポイントは以上です。他に質問や相談があれば続けてどうぞ。",
        ),
      );
      setChatStatus("idle");
    } catch (caught) {
      setChatStatus("error");
      setChatError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleSelectMaterial(material: Material) {
    setSelectedMaterial(material);
    setResolvedPointIndices(new Set());
    setInputText("");
    const points = material.teachingPoints ?? [];
    await runChatTurn(
      material,
      points,
      points.length > 0 ? 0 : undefined,
      [],
      new Set(),
    );
  }

  function handleSendMessage() {
    const text = inputText.trim();
    if (!text || !selectedMaterial || chatStatus === "loading") {
      return;
    }
    setInputText("");
    void runChatTurn(
      selectedMaterial,
      teachingPoints,
      activePointIndex >= 0 ? activePointIndex : undefined,
      messages,
      resolvedPointIndices,
      text,
    );
  }

  function handleSkipCurrentPoint() {
    if (activePointIndex < 0 || !selectedMaterial || chatStatus === "loading") {
      return;
    }
    void runChatTurn(
      selectedMaterial,
      teachingPoints,
      activePointIndex,
      messages,
      resolvedPointIndices,
      "スキップします。",
    );
  }

  function handleSuggestionClick(suggestion: string) {
    setInputText(suggestion);
  }

  return (
    <section aria-label="教材チャット" className="flex flex-col gap-4">
      {status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>
            公開教材の取得に失敗しました: {error}
          </AlertDescription>
        </Alert>
      ) : null}
      {status === "idle" && (materials ?? []).length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>公開済みの教材はまだありません</EmptyTitle>
            <EmptyDescription>
              Admin
              画面の「教材」タブで公開状態を「公開済み」に変更すると、ここに表示されます。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      <ul className="flex flex-col gap-3">
        {(materials ?? []).map((material) => (
          <li key={material.id}>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{material.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {material.learningObjective ? (
                  <p className="text-std-16N-170">
                    {material.learningObjective}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {materialTypeLabel(material.materialType)}
                  </Badge>
                  <Badge variant="secondary">
                    {material.specialtyId
                      ? tagLabel(masters.specialties, material.specialtyId)
                      : "未設定"}
                  </Badge>
                  <Badge variant="secondary">
                    {material.difficultyId
                      ? tagLabel(
                          masters.difficultyLevels,
                          material.difficultyId,
                        )
                      : "未設定"}
                  </Badge>
                  <Badge variant="secondary">
                    {material.learningThemeId
                      ? tagLabel(
                          masters.learningThemes,
                          material.learningThemeId,
                        )
                      : "未設定"}
                  </Badge>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  variant={
                    selectedMaterial?.id === material.id
                      ? "secondary"
                      : "default"
                  }
                  onClick={() => void handleSelectMaterial(material)}
                >
                  {selectedMaterial?.id === material.id
                    ? "選択中"
                    : "この教材についてチャットする"}
                </Button>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>

      {selectedMaterial ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedMaterial.title} についてのチャット</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MessageGroup className="gap-4">
              {messages.map((message) => (
                <Message
                  key={message.id}
                  align={message.role === "user" ? "end" : "start"}
                >
                  <MessageContent>
                    <MessageHeader>
                      {message.role === "user" ? "あなた" : "アシスタント"}
                    </MessageHeader>
                    <div className="rounded-lg bg-muted px-3 py-2">
                      {message.role === "assistant" ? (
                        <MessageMarkdown text={message.text} />
                      ) : (
                        <p className="text-std-16N-170">{message.text}</p>
                      )}
                    </div>
                  </MessageContent>
                </Message>
              ))}
            </MessageGroup>

            {chatStatus === "loading" ? (
              <p className="flex items-center gap-2 text-muted-foreground text-std-16N-170">
                <Spinner />
                応答を生成しています…
              </p>
            ) : null}
            {chatStatus === "error" ? (
              <Alert variant="destructive">
                <AlertDescription>
                  チャットに失敗しました: {chatError}
                </AlertDescription>
              </Alert>
            ) : null}

            {chatStatus !== "loading" ? (
              <>
                {latestAssistantSuggestions(messages).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {latestAssistantSuggestions(messages).map((suggestion) => (
                      <Button
                        type="button"
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                ) : null}

                <Field>
                  {activePointIndex >= 0 ? (
                    <FieldLabel htmlFor="material-chat-input">
                      今回の指導のポイント: {teachingPoints[activePointIndex]}
                    </FieldLabel>
                  ) : null}
                  <Textarea
                    className="min-h-24"
                    id="material-chat-input"
                    aria-label="教材チャットの入力"
                    placeholder={
                      activePointIndex >= 0
                        ? "回答や考えを入力してください"
                        : "質問や相談を入力してください"
                    }
                    value={inputText}
                    onChange={(event) => setInputText(event.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={!inputText.trim()}
                    onClick={handleSendMessage}
                  >
                    <SendIcon data-icon="inline-start" />
                    送信
                  </Button>
                  {activePointIndex >= 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSkipCurrentPoint}
                    >
                      <SkipForwardIcon data-icon="inline-start" />
                      スキップ
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function materialChatMaterial(material: Material): MaterialChatMaterial {
  return {
    learningObjective: material.learningObjective,
    teachingPoints: material.teachingPoints,
    title: material.title,
  };
}
