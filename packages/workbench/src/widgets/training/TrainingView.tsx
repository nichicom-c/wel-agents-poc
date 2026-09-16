import { useEffect, useState } from "react";
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
import {
  DIFFICULTY_LEVELS,
  LEARNING_THEMES,
  SPECIALTIES,
  tagLabel,
} from "../../features/knowledge-review/index.ts";
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
    <>
      <h2>Training</h2>
      <p className="workbench-main-description">
        公開済み教材についての教材チャット
      </p>

      <fieldset className="knowledge-review-role-select">
        <legend>ロール（デモ用の切り替え。実際の認可は未実装）</legend>
        {TRAINING_DEMO_ROLES.map((option) => (
          <label key={option} className="knowledge-review-role-option">
            <input
              type="radio"
              name="training-role"
              checked={role === option}
              onChange={() => setRole(option)}
            />
            {trainingDemoRoleLabel(option)}
          </label>
        ))}
      </fieldset>

      {canView ? (
        <MaterialChatPanel />
      ) : (
        <p className="knowledge-review-forbidden" role="alert">
          この画面を利用する権限がありません。ロールを「新人保健師」「指導者」「管理者」に切り替えてください。
        </p>
      )}
    </>
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
    <section aria-label="教材チャット">
      {status === "error" ? (
        <p className="soap-draft-error">
          公開教材の取得に失敗しました: {error}
        </p>
      ) : null}
      {status === "idle" && (materials ?? []).length === 0 ? (
        <p className="workbench-main-description">
          公開済みの教材はまだありません。Admin 画面の「教材」タブで公開状態を
          「公開済み」に変更すると、ここに表示されます。
        </p>
      ) : null}

      <ul className="knowledge-review-candidate-list">
        {(materials ?? []).map((material) => (
          <li key={material.id} className="knowledge-review-candidate">
            <div className="knowledge-review-candidate-header">
              <h4>{material.title}</h4>
            </div>
            {material.learningObjective ? (
              <p className="soap-draft-text">{material.learningObjective}</p>
            ) : null}
            <div className="knowledge-review-tag-row">
              <span>{materialTypeLabel(material.materialType)}</span>
              <span>
                {material.specialtyId
                  ? tagLabel(SPECIALTIES, material.specialtyId)
                  : "未設定"}
              </span>
              <span>
                {material.difficultyId
                  ? tagLabel(DIFFICULTY_LEVELS, material.difficultyId)
                  : "未設定"}
              </span>
              <span>
                {material.learningThemeId
                  ? tagLabel(LEARNING_THEMES, material.learningThemeId)
                  : "未設定"}
              </span>
            </div>
            <div className="soap-draft-candidate-actions">
              <button
                type="button"
                onClick={() => void handleSelectMaterial(material)}
              >
                {selectedMaterial?.id === material.id
                  ? "選択中"
                  : "この教材についてチャットする"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {selectedMaterial ? (
        <div className="knowledge-review-record-version">
          <h4>{selectedMaterial.title} についてのチャット</h4>

          <ul className="knowledge-review-comment-list">
            {messages.map((message) => (
              <li key={message.id} className="knowledge-review-comment">
                <div className="knowledge-review-comment-header">
                  <span>
                    {message.role === "user" ? "あなた" : "アシスタント"}
                  </span>
                </div>
                {message.role === "assistant" ? (
                  <MessageMarkdown text={message.text} />
                ) : (
                  <p className="soap-draft-text">{message.text}</p>
                )}
              </li>
            ))}
          </ul>

          {chatStatus === "loading" ? (
            <p className="workbench-main-description">応答を生成しています…</p>
          ) : null}
          {chatStatus === "error" ? (
            <p className="soap-draft-error">
              チャットに失敗しました: {chatError}
            </p>
          ) : null}

          {chatStatus !== "loading" ? (
            <>
              {latestAssistantSuggestions(messages).length > 0 ? (
                <div className="soap-gaps-chat-suggestions">
                  {latestAssistantSuggestions(messages).map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      className="soap-gaps-chat-suggestion-chip"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="knowledge-review-comment-form">
                {activePointIndex >= 0 ? (
                  <p className="workbench-main-description">
                    今回の指導のポイント: {teachingPoints[activePointIndex]}
                  </p>
                ) : null}
                <textarea
                  placeholder={
                    activePointIndex >= 0
                      ? "回答や考えを入力してください"
                      : "質問や相談を入力してください"
                  }
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                />
                <div className="soap-draft-candidate-actions">
                  <button
                    type="button"
                    disabled={!inputText.trim()}
                    onClick={handleSendMessage}
                  >
                    送信
                  </button>
                  {activePointIndex >= 0 ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleSkipCurrentPoint}
                    >
                      スキップ
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>
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
