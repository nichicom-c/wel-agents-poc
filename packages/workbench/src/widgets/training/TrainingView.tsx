import { useEffect, useState } from "react";
import {
  DIFFICULTY_LEVELS,
  LEARNING_THEMES,
  SPECIALTIES,
  tagLabel,
} from "../../features/knowledge-review/index.ts";
import {
  canAttemptExercise,
  canViewTraining,
  type ExerciseAttempt,
  type ExerciseAttemptAnswers,
  type ExerciseCase,
  type ExerciseCaseFilters,
  type ExerciseFeedback,
  type ExerciseInstructorComment,
  exerciseAttemptStatusLabel,
  getExerciseCaseById,
  getFeedbackForAttempt,
  listAttemptsForTrainee,
  listExerciseCases,
  listInstructorComments,
  listInstructorQueue,
  modelAnswersOfType,
  modelAnswerTypeLabel,
  postInstructorComment,
  revealFollowup,
  saveDraftAnswers,
  startAttempt,
  submitAttemptAndGenerateFeedback,
  TRAINING_DEMO_ROLES,
  type TrainingDemoRole,
  trainingDemoRoleLabel,
} from "../../features/training/index.ts";

const EMPTY_ANSWERS: ExerciseAttemptAnswers = {
  additionalConfirmationText: "",
  assessmentText: "",
  soapText: "",
  supportPlanText: "",
};

/** dummy データ段階では認証が無いため、role をそのまま実行者名の代わりに使う。 */
const DUMMY_AUTHOR_NAMES: Record<TrainingDemoRole, string> = {
  admin: "管理者（デモ）",
  guest: "未選択",
  instructor: "指導者（デモ）",
  nurse: "専門職（デモ）",
  reviewer: "レビュー承認者（デモ）",
  trainee: "新人保健師（デモ）",
};

type TraineeTab = "exercise" | "history";

export function TrainingView() {
  const [role, setRole] = useState<TrainingDemoRole>("trainee");
  const canView = canViewTraining(role);
  const actorName = DUMMY_AUTHOR_NAMES[role];

  return (
    <>
      <h2>Training</h2>
      <p className="workbench-main-description">
        新人保健師向け演習（issue #9・dummy データ）
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

      {!canView ? (
        <p className="knowledge-review-forbidden" role="alert">
          この画面を利用する権限がありません。ロールを「新人保健師」「指導者」「管理者」に切り替えてください。
        </p>
      ) : canAttemptExercise(role) ? (
        <TraineeView traineeName={actorName} />
      ) : (
        <InstructorView instructorName={actorName} />
      )}
    </>
  );
}

function TraineeView({ traineeName }: { traineeName: string }) {
  const [activeTab, setActiveTab] = useState<TraineeTab>("exercise");

  return (
    <>
      <div className="knowledge-review-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "exercise"}
          data-active={activeTab === "exercise"}
          onClick={() => setActiveTab("exercise")}
        >
          演習
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          data-active={activeTab === "history"}
          onClick={() => setActiveTab("history")}
        >
          学習履歴
        </button>
      </div>

      {activeTab === "exercise" ? (
        <ExerciseTab traineeName={traineeName} />
      ) : (
        <HistoryTab traineeName={traineeName} />
      )}
    </>
  );
}

function ExerciseTab({ traineeName }: { traineeName: string }) {
  const [filters, setFilters] = useState<ExerciseCaseFilters>({});
  const [cases, setCases] = useState<ExerciseCase[] | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ExerciseAttempt | null>(null);
  const [feedback, setFeedback] = useState<ExerciseFeedback | null>(null);
  const [answers, setAnswers] = useState<ExerciseAttemptAnswers>(EMPTY_ANSWERS);

  useEffect(() => {
    let cancelled = false;
    listExerciseCases(filters).then((result) => {
      if (!cancelled) {
        setCases(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const selectedCase = selectedCaseId
    ? getExerciseCaseById(selectedCaseId)
    : undefined;

  async function handleSelectCase(exerciseCase: ExerciseCase) {
    setSelectedCaseId(exerciseCase.id);
    setFeedback(null);
    setAnswers(EMPTY_ANSWERS);
    const created = await startAttempt(exerciseCase.id, traineeName);
    setAttempt(created);
  }

  async function handleReveal(questionId: string) {
    if (!attempt) {
      return;
    }
    const updated = await revealFollowup(attempt.id, questionId);
    setAttempt(updated.find((item) => item.id === attempt.id) ?? attempt);
  }

  async function handleSubmit() {
    if (!attempt) {
      return;
    }
    await saveDraftAnswers(attempt.id, answers);
    const result = await submitAttemptAndGenerateFeedback(attempt.id);
    setAttempt(result.attempt);
    setFeedback(result.feedback);
  }

  const canSubmit =
    attempt?.status === "in_progress" &&
    answers.soapText.trim() &&
    answers.assessmentText.trim() &&
    answers.supportPlanText.trim();

  return (
    <section aria-label="演習">
      <fieldset className="knowledge-review-filters">
        <legend>検索</legend>
        <label>
          分野
          <select
            value={filters.specialtyId ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                specialtyId: event.target.value || undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {SPECIALTIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          難易度
          <select
            value={filters.difficultyId ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                difficultyId: event.target.value || undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {DIFFICULTY_LEVELS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          学習テーマ
          <select
            value={filters.learningThemeId ?? ""}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                learningThemeId: event.target.value || undefined,
              }))
            }
          >
            <option value="">すべて</option>
            {LEARNING_THEMES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <ul className="knowledge-review-candidate-list">
        {(cases ?? []).map((exerciseCase) => (
          <li key={exerciseCase.id} className="knowledge-review-candidate">
            <div className="knowledge-review-candidate-header">
              <h4>{exerciseCase.title}</h4>
            </div>
            <div className="knowledge-review-tag-row">
              <span>{tagLabel(SPECIALTIES, exerciseCase.specialtyId)}</span>
              <span>
                {tagLabel(DIFFICULTY_LEVELS, exerciseCase.difficultyId)}
              </span>
              <span>
                {tagLabel(LEARNING_THEMES, exerciseCase.learningThemeId)}
              </span>
            </div>
            <div className="soap-draft-candidate-actions">
              <button
                type="button"
                onClick={() => void handleSelectCase(exerciseCase)}
              >
                {selectedCaseId === exerciseCase.id
                  ? "選択中"
                  : "この演習に回答する"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {selectedCase && attempt ? (
        <div className="knowledge-review-record-version">
          <h4>初期提示情報</h4>
          <p className="soap-draft-text">{selectedCase.initialPresentation}</p>
          <p className="workbench-main-description">
            想定業務場面: {selectedCase.expectedWorkScene} / 制約条件:{" "}
            {selectedCase.constraints}
          </p>

          <h4>追加質問</h4>
          <ul className="knowledge-review-comment-list">
            {selectedCase.followupQuestions.map((question) => (
              <li key={question.id} className="knowledge-review-comment">
                <p className="soap-draft-text">{question.questionText}</p>
                {attempt.revealedFollowupQuestionIds.includes(question.id) ? (
                  <p className="workbench-main-description">
                    {question.revealedInfoText}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleReveal(question.id)}
                  >
                    質問する
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="knowledge-review-create-form">
            <h5>回答</h5>
            <label>
              SOAP（情報収集）
              <textarea
                value={answers.soapText}
                disabled={attempt.status !== "in_progress"}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    soapText: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              追加確認事項
              <textarea
                value={answers.additionalConfirmationText}
                disabled={attempt.status !== "in_progress"}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    additionalConfirmationText: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              アセスメント
              <textarea
                value={answers.assessmentText}
                disabled={attempt.status !== "in_progress"}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    assessmentText: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              支援方針
              <textarea
                value={answers.supportPlanText}
                disabled={attempt.status !== "in_progress"}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    supportPlanText: event.target.value,
                  }))
                }
              />
            </label>
            {attempt.status === "in_progress" ? (
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
              >
                提出する
              </button>
            ) : (
              <p className="workbench-main-description">
                状態: {exerciseAttemptStatusLabel(attempt.status)}
              </p>
            )}
          </div>

          {feedback ? (
            <FeedbackPanel exerciseCase={selectedCase} feedback={feedback} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FeedbackPanel({
  exerciseCase,
  feedback,
}: {
  exerciseCase: ExerciseCase;
  feedback: ExerciseFeedback;
}) {
  return (
    <div className="knowledge-review-decision-form">
      <h5>フィードバック</h5>
      <p className="soap-draft-text">情報収集: {feedback.dataCollectionNote}</p>
      <p className="soap-draft-text">根拠: {feedback.rationaleNote}</p>
      <p className="soap-draft-text">アセスメント: {feedback.assessmentNote}</p>
      <p className="soap-draft-text">支援方針: {feedback.supportPlanNote}</p>
      <p className="soap-draft-text">記録表現: {feedback.documentationNote}</p>

      <h5>模範回答（単一正解ではなく複数の妥当な判断パターン）</h5>
      {(["soap", "assessment", "support_plan"] as const).map((type) => (
        <div key={type}>
          <p className="workbench-main-description">
            {modelAnswerTypeLabel(type)}
          </p>
          <ul className="knowledge-review-comment-list">
            {modelAnswersOfType(exerciseCase, type).map((answer) => (
              <li key={answer.id} className="knowledge-review-comment">
                <p className="soap-draft-text">{answer.content}</p>
                <p className="workbench-main-description">
                  {answer.acceptableNote}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ traineeName }: { traineeName: string }) {
  const [attempts, setAttempts] = useState<ExerciseAttempt[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAttemptsForTrainee(traineeName).then((result) => {
      if (!cancelled) {
        setAttempts(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [traineeName]);

  const themeCounts = new Map<string, number>();
  for (const attempt of attempts ?? []) {
    const exerciseCase = getExerciseCaseById(attempt.exerciseCaseId);
    if (!exerciseCase) {
      continue;
    }
    themeCounts.set(
      exerciseCase.learningThemeId,
      (themeCounts.get(exerciseCase.learningThemeId) ?? 0) + 1,
    );
  }

  return (
    <section aria-label="学習履歴">
      <h4>回答履歴</h4>
      <ul className="knowledge-review-status-history">
        {(attempts ?? []).map((attempt) => (
          <li key={attempt.id}>
            {getExerciseCaseById(attempt.exerciseCaseId)?.title ??
              attempt.exerciseCaseId}{" "}
            — {exerciseAttemptStatusLabel(attempt.status)}
            {attempt.submittedAt ? ` — ${attempt.submittedAt}` : ""}
          </li>
        ))}
      </ul>

      <h4>学習テーマ別の提出件数</h4>
      <p className="workbench-main-description">
        弱点傾向の集計粒度は issue #9 の Open Question
        のため、ここでは学習テーマ別の提出件数だけを表示する。
      </p>
      <ul className="knowledge-review-status-history">
        {[...themeCounts.entries()].map(([themeId, count]) => (
          <li key={themeId}>
            {tagLabel(LEARNING_THEMES, themeId)}: {count}件
          </li>
        ))}
      </ul>
    </section>
  );
}

function InstructorView({ instructorName }: { instructorName: string }) {
  const [attempts, setAttempts] = useState<ExerciseAttempt[] | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    null,
  );
  const [comments, setComments] = useState<ExerciseInstructorComment[]>([]);
  const [commentBody, setCommentBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    listInstructorQueue().then((result) => {
      if (!cancelled) {
        setAttempts(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAttempt = (attempts ?? []).find(
    (a) => a.id === selectedAttemptId,
  );
  const selectedCase = selectedAttempt
    ? getExerciseCaseById(selectedAttempt.exerciseCaseId)
    : undefined;
  const feedback = selectedAttempt
    ? getFeedbackForAttempt(selectedAttempt.id)
    : undefined;

  async function handleSelect(attemptId: string) {
    setSelectedAttemptId(attemptId);
    setCommentBody("");
    const targetFeedback = getFeedbackForAttempt(attemptId);
    setComments(
      targetFeedback ? await listInstructorComments(targetFeedback.id) : [],
    );
  }

  async function handleAddComment() {
    if (!feedback || !commentBody.trim()) {
      return;
    }
    const updated = await postInstructorComment(
      feedback.id,
      instructorName,
      commentBody.trim(),
    );
    setComments(
      updated.filter((comment) => comment.feedbackId === feedback.id),
    );
    setCommentBody("");
  }

  return (
    <section aria-label="指導者ビュー">
      <ul className="knowledge-review-candidate-list">
        {(attempts ?? []).map((attempt) => (
          <li key={attempt.id} className="knowledge-review-candidate">
            <div className="knowledge-review-candidate-header">
              <h4>
                {getExerciseCaseById(attempt.exerciseCaseId)?.title ??
                  attempt.exerciseCaseId}
              </h4>
              <span className="knowledge-review-status-badge">
                {exerciseAttemptStatusLabel(attempt.status)}
              </span>
            </div>
            <p className="workbench-main-description">
              受講者: {attempt.traineeName}
            </p>
            <div className="soap-draft-candidate-actions">
              <button
                type="button"
                onClick={() => void handleSelect(attempt.id)}
              >
                {selectedAttemptId === attempt.id ? "選択中" : "確認する"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {selectedAttempt && selectedCase ? (
        <div className="knowledge-review-record-version">
          <h4>回答内容</h4>
          <p className="soap-draft-text">
            SOAP: {selectedAttempt.answers.soapText}
          </p>
          <p className="soap-draft-text">
            追加確認事項: {selectedAttempt.answers.additionalConfirmationText}
          </p>
          <p className="soap-draft-text">
            アセスメント: {selectedAttempt.answers.assessmentText}
          </p>
          <p className="soap-draft-text">
            支援方針: {selectedAttempt.answers.supportPlanText}
          </p>

          {feedback ? (
            <FeedbackPanel exerciseCase={selectedCase} feedback={feedback} />
          ) : null}

          <div className="knowledge-review-comment-form">
            <h5>指導者コメント</h5>
            <ul className="knowledge-review-comment-list">
              {comments.map((comment) => (
                <li key={comment.id} className="knowledge-review-comment">
                  <div className="knowledge-review-comment-header">
                    <span>{comment.instructorName}</span>
                  </div>
                  <p className="soap-draft-text">{comment.body}</p>
                </li>
              ))}
            </ul>
            <textarea
              placeholder="補足コメントを入力してください"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
            />
            <button
              type="button"
              disabled={!commentBody.trim()}
              onClick={() => void handleAddComment()}
            >
              追加
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
