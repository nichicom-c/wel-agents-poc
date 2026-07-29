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
  fromApiQuestions,
  type GapApiItem,
  type GapQuestionItem,
  gapTypeLabel,
  groupByGapType,
  markAnswered,
  markSkipped,
  postSoapGaps,
  withDraftAnswer,
  withDraftSkipReason,
} from "../../features/soap-gaps/index.ts";

const CATEGORY_LABELS: Record<SoapCategory, string> = {
  S: "S・主観的情報",
  O: "O・客観的情報",
  A: "A・アセスメント",
  P: "P・支援計画",
  UNCLASSIFIED: "未分類・確認待ち",
};

const STATUS_LABELS: Record<SoapCandidateStatus, string> = {
  pending: "未対応",
  adopted: "採用",
  edited: "編集済み",
  rejected: "却下",
  deferred: "後で確認",
};

const QUESTION_STATUS_LABELS: Record<GapQuestionItem["status"], string> = {
  pending: "未対応",
  answered: "回答済み",
  skipped: "スキップ",
};

type AnalyzeStatus = "idle" | "loading" | "error";
type GapsStatus = "idle" | "loading" | "error";

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
  const [gaps, setGaps] = useState<GapApiItem[] | null>(null);
  const [questions, setQuestions] = useState<GapQuestionItem[] | null>(null);
  const [gapsStatus, setGapsStatus] = useState<GapsStatus>("idle");
  const [gapsError, setGapsError] = useState("");

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
    setGaps(null);
    setQuestions(null);
    setGapsStatus("idle");
    setGapsError("");
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

  async function handleCheckGaps() {
    if (!candidates || candidates.length === 0 || gapsStatus === "loading") {
      return;
    }
    setGapsStatus("loading");
    setGapsError("");
    try {
      const apiCandidates = candidates.map(
        ({ category, draftText, evidenceQuote, reasoning, confidence }) => ({
          category,
          draftText,
          evidenceQuote,
          reasoning,
          confidence,
        }),
      );
      const result = await postSoapGaps({ candidates: apiCandidates });
      setGaps(result.gaps);
      setQuestions(fromApiQuestions(result.questions));
      setGapsStatus("idle");
    } catch (caught) {
      setGapsStatus("error");
      setGapsError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function handleAnswerQuestion(question: GapQuestionItem) {
    const trimmed = question.answerText.trim();
    if (!trimmed) {
      return;
    }
    setCandidates((prev) =>
      prev
        ? addManualCandidate(prev, {
            category: question.soapCategory,
            draftText: trimmed,
            evidenceQuote: trimmed,
            reasoning: `不足確認「${question.questionText}」への回答として追加。`,
            confidence: 1,
          })
        : prev,
    );
    setQuestions((prev) => (prev ? markAnswered(prev, question.id) : prev));
  }

  function handleSkipQuestion(question: GapQuestionItem) {
    setQuestions((prev) => (prev ? markSkipped(prev, question.id) : prev));
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

          {groups.length === 0 ? (
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
              </div>
            ))
          )}
        </section>
      ) : null}

      {candidates && candidates.length > 0 ? (
        <section
          className="soap-gaps-section"
          aria-label="不足確認"
          aria-busy={gapsStatus === "loading"}
        >
          <h3>不足確認</h3>
          <button
            type="button"
            className="soap-gaps-check-button"
            disabled={gapsStatus === "loading"}
            onClick={() => void handleCheckGaps()}
          >
            {gapsStatus === "loading" ? "確認中…" : "不足を確認"}
          </button>
          {gapsStatus === "error" ? (
            <p className="soap-draft-error">{gapsError}</p>
          ) : null}

          {gaps ? (
            <div className="soap-gaps-summary">
              <h4>不足一覧</h4>
              {gaps.length === 0 ? (
                <p className="workbench-main-description">
                  不足は見つかりませんでした。
                </p>
              ) : (
                groupByGapType(gaps).map((group) => (
                  <div key={group.gapType} className="soap-gaps-group">
                    <h5>{gapTypeLabel(group.gapType)}</h5>
                    <ul className="soap-gaps-list">
                      {group.items.map((gap) => (
                        <li
                          key={`${gap.gapType}:${gap.soapCategory}:${gap.targetItem}:${gap.detail}`}
                          className="soap-gap-item"
                        >
                          <span
                            className="soap-gap-category"
                            data-category={gap.soapCategory}
                          >
                            {CATEGORY_LABELS[gap.soapCategory]}
                          </span>
                          <p className="soap-gap-detail">{gap.detail}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {questions ? (
            <div className="soap-gaps-questions">
              <h4>確認質問</h4>
              {questions.length === 0 ? (
                <p className="workbench-main-description">
                  確認が必要な質問はありません。
                </p>
              ) : (
                <ul className="soap-gaps-question-list">
                  {questions.map((question) => (
                    <li
                      key={question.id}
                      className="soap-gaps-question"
                      data-status={question.status}
                    >
                      <div className="soap-gaps-question-header">
                        <span className="soap-gap-type-badge">
                          {gapTypeLabel(question.gapType)}
                        </span>
                        <span
                          className="soap-gap-category"
                          data-category={question.soapCategory}
                        >
                          {CATEGORY_LABELS[question.soapCategory]}
                        </span>
                        <span className="soap-candidate-status">
                          {QUESTION_STATUS_LABELS[question.status]}
                        </span>
                      </div>
                      <p className="soap-gaps-question-text">
                        {question.questionText}
                      </p>
                      <textarea
                        className="soap-gaps-answer-input"
                        aria-label="回答"
                        placeholder="補足情報を入力してください"
                        value={question.answerText}
                        onChange={(event) =>
                          setQuestions((prev) =>
                            prev
                              ? withDraftAnswer(
                                  prev,
                                  question.id,
                                  event.target.value,
                                )
                              : prev,
                          )
                        }
                      />
                      <div className="soap-draft-candidate-actions">
                        <button
                          type="button"
                          disabled={!question.answerText.trim()}
                          onClick={() => handleAnswerQuestion(question)}
                        >
                          回答して下書きに反映
                        </button>
                        {question.skippable ? (
                          <>
                            <input
                              className="soap-gaps-skip-reason-input"
                              aria-label="スキップ理由"
                              placeholder="スキップ理由（任意）"
                              value={question.skipReason}
                              onChange={(event) =>
                                setQuestions((prev) =>
                                  prev
                                    ? withDraftSkipReason(
                                        prev,
                                        question.id,
                                        event.target.value,
                                      )
                                    : prev,
                                )
                              }
                            />
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => handleSkipQuestion(question)}
                            >
                              スキップ
                            </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
