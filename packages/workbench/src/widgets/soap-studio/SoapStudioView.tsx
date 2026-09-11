import { useEffect, useState } from "react";

import {
  addManualCandidate,
  buildReflectionSelections,
  confidenceTier,
  fromApiCandidates,
  groupByCategory,
  postSoapDraft,
  type ReflectionSelections,
  SOAP_RECORD_TYPES,
  type SoapCandidateStatus,
  type SoapCategory,
  type SoapDraftCandidate,
  soapRecordTypeLabel,
  toggleReflectionSelection,
  withEditedText,
  withStatus,
} from "../../features/soap-draft/index.ts";
import {
  appendAssistantMessage,
  appendUserMessage,
  type ChatMessage,
  type GapApiItem,
  gapTypeLabel,
  latestAssistantSuggestions,
  postSoapGaps,
  postSoapGapsChat,
} from "../../features/soap-gaps/index.ts";
import {
  postSoapRecord,
  type SavedRecordIds,
  savableItemsFromCandidates,
  withSavedRecordId,
} from "../../features/soap-records/index.ts";

const CATEGORY_LABELS: Record<SoapCategory, string> = {
  S: "S・主観的情報",
  O: "O・客観的情報",
  A: "A・アセスメント",
  P: "P・支援計画",
  UNCLASSIFIED: "該当なし",
};

const STATUS_LABELS: Record<SoapCandidateStatus, string> = {
  pending: "未対応",
  adopted: "採用",
  edited: "編集済み",
  rejected: "却下",
  deferred: "後で確認",
};

type AnalyzeStatus = "idle" | "loading" | "error";
type GapsStatus = "idle" | "loading" | "error";
type ChatStatus = "idle" | "loading" | "error";
type SaveStatus = "idle" | "loading" | "error";

/** ルールベースで検出した不足の同一性キー（`resolvedGapKeys` の判定に使う）。 */
function gapKey(gap: GapApiItem): string {
  return `${gap.gapType}:${gap.soapCategory}:${gap.targetItem}:${gap.detail}`;
}

function toApiCandidates(candidates: SoapDraftCandidate[]) {
  return candidates.map(
    ({ category, draftText, evidenceQuote, reasoning, confidence }) => ({
      category,
      draftText,
      evidenceQuote,
      reasoning,
      confidence,
    }),
  );
}

export type SoapStudioViewProps = {
  /** Voice Capture など他画面から引き継ぐ入力素材テキスト。渡されると textarea に反映する。 */
  seedText?: string;
  /** seedText の由来（例: 「音声記録 rec-xxx」）。反映後も画面に表示し続ける traceability 用の tag。 */
  seedSourceLabel?: string;
  /** seedText を textarea へ反映し終えたことを呼び出し側へ伝える（再訪時の再反映を防ぐ）。 */
  onSeedConsumed?: () => void;
};

export function SoapStudioView({
  seedText,
  seedSourceLabel,
  onSeedConsumed,
}: SoapStudioViewProps = {}) {
  const [text, setText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [candidates, setCandidates] = useState<SoapDraftCandidate[] | null>(
    null,
  );
  const [reflectionSelections, setReflectionSelections] =
    useState<ReflectionSelections | null>(null);
  const [analyzeStatus, setAnalyzeStatus] = useState<AnalyzeStatus>("idle");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [gapQueue, setGapQueue] = useState<GapApiItem[] | null>(null);
  const [resolvedGapKeys, setResolvedGapKeys] = useState<Set<string>>(
    new Set(),
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatConversationId, setChatConversationId] = useState<
    string | undefined
  >(undefined);
  const [chatInputText, setChatInputText] = useState("");
  const [gapsStatus, setGapsStatus] = useState<GapsStatus>("idle");
  const [gapsError, setGapsError] = useState("");
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [chatError, setChatError] = useState("");
  const [savedRecordIds, setSavedRecordIds] = useState<SavedRecordIds>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  /** キュー中、まだ resolvedGapKeys に含まれない最初の不足（無ければ全件対応済み）。 */
  const activeGap = (gapQueue ?? []).find(
    (gap) => !resolvedGapKeys.has(gapKey(gap)),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: seedText の到着だけを検知したい（onSeedConsumed/seedSourceLabel は同時に渡される値）。
  useEffect(() => {
    if (!seedText) {
      return;
    }
    setText(seedText);
    setSourceLabel(seedSourceLabel ?? "");
    onSeedConsumed?.();
  }, [seedText]);

  async function handleAnalyze() {
    if (!text.trim() || analyzeStatus === "loading") {
      return;
    }
    setAnalyzeStatus("loading");
    setError("");
    setGapQueue(null);
    setResolvedGapKeys(new Set());
    setChatMessages([]);
    setChatConversationId(undefined);
    setChatInputText("");
    setGapsStatus("idle");
    setGapsError("");
    setChatStatus("idle");
    setChatError("");
    try {
      const result = await postSoapDraft({ text });
      setCandidates(fromApiCandidates(result.candidates));
      setReflectionSelections(
        buildReflectionSelections(result.recommendedRecordTypes),
      );
      setAnalyzeStatus("idle");
    } catch (caught) {
      setAnalyzeStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  /**
   * 不足確認チャットの1ターンを実行する。resolved になれば（候補があれば採用し）次の未解決の
   * 不足を自動で提示し続ける（AI主導）。すべて解決したら完了メッセージを表示する。
   * `queue`/`currentCandidates`/`resolvedKeys` は React state の非同期反映に左右されないよう、
   * 呼び出し元から明示的に受け取って引き回す。
   */
  async function runChatTurn(
    queue: GapApiItem[],
    currentCandidates: SoapDraftCandidate[],
    gap: GapApiItem,
    conversationId: string | undefined,
    resolvedKeys: Set<string>,
    message?: string,
  ) {
    setChatStatus("loading");
    setChatError("");
    try {
      const result = await postSoapGapsChat({
        candidates: toApiCandidates(currentCandidates),
        conversationId,
        gap,
        message,
      });
      setChatConversationId(result.conversationId);
      setChatMessages((prev) =>
        appendAssistantMessage(prev, result.message, result.suggestions),
      );

      if (!result.resolved) {
        setChatStatus("idle");
        return;
      }

      const nextResolvedKeys = new Set(resolvedKeys);
      nextResolvedKeys.add(gapKey(gap));
      setResolvedGapKeys(nextResolvedKeys);

      let nextCandidates = currentCandidates;
      if (result.candidateText) {
        nextCandidates = addManualCandidate(currentCandidates, {
          category: gap.soapCategory,
          draftText: result.candidateText,
          evidenceQuote: result.candidateText,
          reasoning: `不足確認チャット「${gap.detail}」への回答として追加。`,
          confidence: 1,
        });
        setCandidates(nextCandidates);
      }

      const nextGap = queue.find((item) => !nextResolvedKeys.has(gapKey(item)));
      if (nextGap) {
        await runChatTurn(
          queue,
          nextCandidates,
          nextGap,
          result.conversationId,
          nextResolvedKeys,
        );
        return;
      }

      setChatMessages((prev) =>
        appendAssistantMessage(
          prev,
          "不足確認はこれで完了です。内容を確認し、正式記録として保存してください。",
        ),
      );
      setChatStatus("idle");
    } catch (caught) {
      setChatStatus("error");
      setChatError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleStartGapChat() {
    if (!candidates || candidates.length === 0 || gapsStatus === "loading") {
      return;
    }
    setGapsStatus("loading");
    setGapsError("");
    setChatMessages([]);
    setChatConversationId(undefined);
    setChatInputText("");
    setResolvedGapKeys(new Set());
    setChatError("");
    try {
      const result = await postSoapGaps({
        candidates: toApiCandidates(candidates),
      });
      setGapQueue(result.gaps);
      setGapsStatus("idle");
      if (result.gaps.length === 0) {
        setChatMessages(
          appendAssistantMessage(
            [],
            "不足は見つかりませんでした。このまま正式記録として保存できます。",
          ),
        );
        return;
      }
      const firstGap = result.gaps[0];
      if (firstGap) {
        await runChatTurn(
          result.gaps,
          candidates,
          firstGap,
          undefined,
          new Set(),
        );
      }
    } catch (caught) {
      setGapsStatus("error");
      setGapsError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function handleSendChatMessage() {
    const trimmed = chatInputText.trim();
    if (!activeGap || !trimmed || !candidates || chatStatus === "loading") {
      return;
    }
    setChatMessages((prev) => appendUserMessage(prev, trimmed));
    setChatInputText("");
    void runChatTurn(
      gapQueue ?? [],
      candidates,
      activeGap,
      chatConversationId,
      resolvedGapKeys,
      trimmed,
    );
  }

  function handleSkipCurrentGap() {
    if (!activeGap?.skippable || !candidates || chatStatus === "loading") {
      return;
    }
    const skipText = "スキップします。";
    setChatMessages((prev) => appendUserMessage(prev, skipText));
    void runChatTurn(
      gapQueue ?? [],
      candidates,
      activeGap,
      chatConversationId,
      resolvedGapKeys,
      skipText,
    );
  }

  /** 提案チップは即送信ではなく、編集してから送れるよう入力欄へ挿入するだけにする。 */
  function handleSuggestionClick(suggestion: string) {
    setChatInputText(suggestion);
  }

  function handleStatusChange(id: string, next: SoapCandidateStatus) {
    setCandidates((prev) => (prev ? withStatus(prev, id, next) : prev));
  }

  function handleReflectionToggle(
    recordType: (typeof SOAP_RECORD_TYPES)[number],
  ) {
    setReflectionSelections((prev) =>
      prev ? toggleReflectionSelection(prev, recordType) : prev,
    );
  }

  /**
   * 反映候補でチェックされている記録種別それぞれについて、正式記録として保存する
   * （issue #8 の前提。docs/notes/2026-07-30-... の「新規: SOAP Studio → 正式記録保存 →
   * Knowledge Review」参照）。同じセッション内で既に保存済みの記録種別は、新規記録では
   * なく version を追記する（`savedRecordIds`）。採用/編集済みの候補が無い記録種別は
   * 保存対象から除く。
   */
  async function handleSaveRecords() {
    if (!candidates || !reflectionSelections || saveStatus === "loading") {
      return;
    }

    const targetTypes = SOAP_RECORD_TYPES.filter(
      (recordType) => reflectionSelections[recordType],
    );
    const items = savableItemsFromCandidates(candidates);

    if (targetTypes.length === 0 || items.length === 0) {
      setSaveStatus("error");
      setSaveError(
        "保存する記録種別（反映候補）を1つ以上チェックし、採用または編集済みの候補を1件以上作ってください。",
      );
      return;
    }

    setSaveStatus("loading");
    setSaveError("");
    setSaveNotice("");

    const source = sourceLabel ? "voice_capture" : "soap_draft_ai";
    const savedNotices: string[] = [];

    try {
      let nextSavedRecordIds = savedRecordIds;
      for (const recordType of targetTypes) {
        const result = await postSoapRecord({
          items,
          recordId: nextSavedRecordIds[recordType],
          recordType,
          source,
        });
        nextSavedRecordIds = withSavedRecordId(
          nextSavedRecordIds,
          recordType,
          result.recordId,
        );
        savedNotices.push(
          `${soapRecordTypeLabel(recordType)}: version ${result.versionNo} として保存しました`,
        );
      }
      setSavedRecordIds(nextSavedRecordIds);
      setSaveNotice(savedNotices.join(" / "));
      setSaveStatus("idle");
    } catch (caught) {
      setSaveStatus("error");
      setSaveError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function startEditing(candidate: SoapDraftCandidate) {
    setEditingId(candidate.id);
    setEditingText(candidate.draftText);
  }

  function saveEditing() {
    if (!editingId) {
      return;
    }
    setCandidates((prev) =>
      prev ? withEditedText(prev, editingId, editingText) : prev,
    );
    setEditingId(null);
    setEditingText("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingText("");
  }

  const groups = candidates ? groupByCategory(candidates) : [];

  return (
    <>
      <h2>SOAP Studio</h2>
      <p className="workbench-main-description">
        入力素材から SOAP 下書きと不足確認を作る作業画面
      </p>

      <section
        className="soap-draft-form"
        aria-label="SOAP 下書き生成"
        aria-busy={analyzeStatus === "loading"}
      >
        <h3>SOAP 下書き生成</h3>
        {sourceLabel ? (
          <p className="soap-draft-source-tag">由来: {sourceLabel}</p>
        ) : null}
        <textarea
          className="soap-draft-input"
          aria-label="入力素材テキスト"
          placeholder="テキスト、編集済み transcript、会議メモなどを貼り付けてください"
          value={text}
          disabled={analyzeStatus === "loading"}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="soap-draft-form-actions">
          {analyzeStatus === "loading" ? (
            <p className="soap-draft-progress" role="status" aria-live="polite">
              <span className="soap-draft-progress-pulse" aria-hidden="true" />
              解析中…（30秒ほどかかることがあります）
            </p>
          ) : null}
          <button
            type="button"
            className="soap-draft-analyze-button"
            disabled={!text.trim() || analyzeStatus === "loading"}
            onClick={() => void handleAnalyze()}
          >
            {analyzeStatus === "loading" ? "解析中…" : "解析"}
          </button>
        </div>
        {analyzeStatus === "error" ? (
          <p className="soap-draft-error">{error}</p>
        ) : null}
      </section>

      {candidates && reflectionSelections ? (
        <section className="soap-draft-results" aria-label="SOAP 下書き候補">
          <fieldset className="soap-reflection-targets">
            <legend>反映候補</legend>
            {SOAP_RECORD_TYPES.map((recordType) => (
              <label key={recordType} className="soap-reflection-target">
                <input
                  type="checkbox"
                  checked={reflectionSelections[recordType]}
                  onChange={() => handleReflectionToggle(recordType)}
                />
                {soapRecordTypeLabel(recordType)}
              </label>
            ))}
          </fieldset>

          {candidates.length === 0 ? (
            <p className="workbench-main-description">
              候補が見つかりませんでした。
            </p>
          ) : (
            groups.map((group) => (
              <div
                key={group.category}
                className="soap-draft-category-group"
                data-category={group.category}
              >
                <h4>{CATEGORY_LABELS[group.category]}</h4>
                {group.candidates.length === 0 ? (
                  <p className="workbench-main-description">該当なし</p>
                ) : (
                  <ul className="soap-draft-candidate-list">
                    {group.candidates.map((candidate) => (
                      <li
                        key={candidate.id}
                        className="soap-draft-candidate"
                        data-category={candidate.category}
                        data-status={candidate.status}
                      >
                        <div className="soap-draft-candidate-header">
                          <span
                            className="soap-confidence-badge"
                            data-tier={confidenceTier(candidate.confidence)}
                          >
                            確信度 {Math.round(candidate.confidence * 100)}%
                          </span>
                          <span className="soap-candidate-status">
                            {STATUS_LABELS[candidate.status]}
                          </span>
                        </div>
                        {editingId === candidate.id ? (
                          <>
                            <textarea
                              className="soap-draft-edit-input"
                              aria-label="下書き文章を編集"
                              value={editingText}
                              onChange={(event) =>
                                setEditingText(event.target.value)
                              }
                            />
                            <div className="soap-draft-candidate-actions">
                              <button type="button" onClick={saveEditing}>
                                保存
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={cancelEditing}
                              >
                                キャンセル
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="soap-draft-text">
                              {candidate.draftText}
                            </p>
                            <blockquote className="soap-evidence-quote">
                              {candidate.evidenceQuote}
                            </blockquote>
                            <p className="soap-reasoning">
                              {candidate.reasoning}
                            </p>
                            <div className="soap-draft-candidate-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  handleStatusChange(candidate.id, "adopted")
                                }
                              >
                                採用
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => startEditing(candidate)}
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() =>
                                  handleStatusChange(candidate.id, "rejected")
                                }
                              >
                                却下
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() =>
                                  handleStatusChange(candidate.id, "deferred")
                                }
                              >
                                後で確認
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </section>
      ) : null}

      {candidates && candidates.length > 0 ? (
        <section
          className="soap-gaps-section"
          aria-label="不足確認"
          aria-busy={gapsStatus === "loading" || chatStatus === "loading"}
        >
          <h3>不足確認</h3>
          <p className="workbench-main-description">
            検出した不足を優先度順にAIとチャットで1件ずつ埋め、SOAPを完成させます。
          </p>
          <button
            type="button"
            className="soap-gaps-check-button"
            disabled={gapsStatus === "loading"}
            onClick={() => void handleStartGapChat()}
          >
            {gapsStatus === "loading" ? "確認中…" : "不足をチャットで確認"}
          </button>
          {gapsStatus === "error" ? (
            <p className="soap-draft-error">{gapsError}</p>
          ) : null}

          {chatMessages.length > 0 ? (
            <div
              className="soap-gaps-chat-thread"
              role="log"
              aria-label="不足確認チャット"
            >
              <ul className="soap-gaps-chat-message-list">
                {chatMessages.map((message) => (
                  <li
                    key={message.id}
                    className="soap-gaps-chat-message"
                    data-role={message.role}
                  >
                    <p className="soap-gaps-chat-message-text">
                      {message.text}
                    </p>
                  </li>
                ))}
              </ul>

              {activeGap ? (
                <>
                  {latestAssistantSuggestions(chatMessages).length > 0 ? (
                    <div className="soap-gaps-chat-suggestions">
                      {latestAssistantSuggestions(chatMessages).map(
                        (suggestion) => (
                          <button
                            type="button"
                            key={suggestion}
                            className="soap-gaps-chat-suggestion-chip"
                            onClick={() => handleSuggestionClick(suggestion)}
                          >
                            {suggestion}
                          </button>
                        ),
                      )}
                    </div>
                  ) : null}

                  <div
                    className="soap-gaps-chat-input-row"
                    data-category={activeGap.soapCategory}
                  >
                    <span
                      className="soap-gap-type-badge"
                      title={activeGap.detail}
                    >
                      {gapTypeLabel(activeGap.gapType)} ／{" "}
                      {CATEGORY_LABELS[activeGap.soapCategory]}
                    </span>
                    <textarea
                      className="soap-gaps-chat-input"
                      aria-label="チャットへの返信"
                      placeholder="回答を入力してください"
                      value={chatInputText}
                      disabled={chatStatus === "loading"}
                      onChange={(event) => setChatInputText(event.target.value)}
                    />
                    <div className="soap-draft-candidate-actions">
                      <button
                        type="button"
                        disabled={
                          !chatInputText.trim() || chatStatus === "loading"
                        }
                        onClick={handleSendChatMessage}
                      >
                        送信
                      </button>
                      {activeGap.skippable ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={chatStatus === "loading"}
                          onClick={handleSkipCurrentGap}
                        >
                          スキップ
                        </button>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              {chatStatus === "loading" ? (
                <p
                  className="soap-draft-progress"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="soap-draft-progress-pulse"
                    aria-hidden="true"
                  />
                  返信を作成中…
                </p>
              ) : null}
              {chatStatus === "error" ? (
                <p className="soap-draft-error">{chatError}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {candidates && reflectionSelections ? (
        <section
          className="soap-save-record-section"
          aria-label="正式記録として保存"
          aria-busy={saveStatus === "loading"}
        >
          <h3>正式記録として保存</h3>
          <p className="workbench-main-description">
            反映候補でチェックした記録種別ごとに、採用/編集済みの候補を正式記録として保存します
            （このセッションで同じ記録種別を再度保存すると、新しい版として追記されます）。
          </p>
          <button
            type="button"
            className="soap-save-record-button"
            disabled={saveStatus === "loading"}
            onClick={() => void handleSaveRecords()}
          >
            {saveStatus === "loading" ? "保存中…" : "正式記録として保存"}
          </button>
          {saveStatus === "error" ? (
            <p className="soap-draft-error">{saveError}</p>
          ) : null}
          {saveNotice ? (
            <p className="soap-save-record-notice" role="status">
              {saveNotice}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
