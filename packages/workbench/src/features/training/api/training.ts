import {
  attemptsForTrainee,
  type ExerciseAttempt,
  type ExerciseAttemptAnswers,
  revealFollowupQuestion,
  startExerciseAttempt,
  submitExerciseAttempt,
  withDraftAnswers,
} from "../model/exercise-attempts.ts";
import {
  type ExerciseCase,
  type ExerciseCaseFilters,
  filterExerciseCases,
} from "../model/exercise-cases.ts";
import {
  addInstructorComment as addInstructorCommentToList,
  commentsForFeedback,
  type ExerciseFeedback,
  type ExerciseInstructorComment,
  generateDummyFeedback,
} from "../model/exercise-feedback.ts";

/**
 * `terraform/aws/bff` に Aurora 等の実データストアも、演習フィードバック生成用の AgentCore
 * 単発 agent もまだ無いため、issue #9 の Training UI を dummy データで先行実装する。
 * `knowledge-review` / `admin` と同じ方針で module 内変数を DB の代わりに使う。ブラウザを
 * 再読み込みすると内容はリセットされる。
 */

const EXERCISE_CASES: ExerciseCase[] = [
  {
    constraints: "訪問時間は30分。次回訪問は2週間後を予定。",
    difficultyId: "intermediate",
    evaluationCriteria: [
      "S/O の記載から A への論理的な繋がりがあるか。",
      "パートナーまたは環境要因など複数の視点から要因を検討しているか。",
      "次回確認事項が支援方針に含まれているか。",
    ],
    expectedWorkScene: "産後2ヶ月の母子訪問",
    followupQuestions: [
      {
        id: "case-1-q1",
        questionText: "パートナーの育児参加状況を確認する",
        revealedInfoText: "パートナーは日中不在が多く、育児参加は限定的。",
      },
      {
        id: "case-1-q2",
        questionText: "母親自身の睡眠環境を確認する",
        revealedInfoText:
          "児と同室で就寝しており、授乳のたびに完全に覚醒している。",
      },
    ],
    id: "case-1",
    initialPresentation:
      "母親から「夜間の授乳がつらく、眠れていない」と発言。児は生後2ヶ月、体重増加は標準曲線内。母親の表情に疲労が見られる。",
    learningThemeId: "assessment-basics",
    modelAnswers: [
      {
        acceptableNote: "S/O を区別して整理できているパターン。",
        answerType: "soap",
        content:
          "S: 夜間の授乳がつらく眠れていない。O: 体重増加は標準曲線内、母親の表情に疲労が見られる。",
        id: "case-1-model-soap-1",
      },
      {
        acceptableNote: "パートナーの育児参加という要因に着目するパターン。",
        answerType: "assessment",
        content:
          "産後の睡眠不足による疲労蓄積のリスク。パートナーの育児参加状況の確認が必要。",
        id: "case-1-model-assessment-1",
      },
      {
        acceptableNote:
          "睡眠環境（同室就寝）という要因に着目するパターンも許容する。",
        answerType: "assessment",
        content:
          "本人の睡眠環境（同室就寝）が疲労を助長している可能性がある。環境調整の観点も妥当。",
        id: "case-1-model-assessment-2",
      },
      {
        acceptableNote: "パートナー要因への対応を軸にしたパターン。",
        answerType: "support_plan",
        content:
          "家事・育児支援サービスの利用を提案し、次回パートナーの育児参加状況を確認する。",
        id: "case-1-model-plan-1",
      },
      {
        acceptableNote: "睡眠環境の改善を軸にしたパターンも許容する。",
        answerType: "support_plan",
        content:
          "産後ケア事業の利用を提案し、次回、睡眠環境の改善状況を確認する。",
        id: "case-1-model-plan-2",
      },
    ],
    requiredInstitutionalKnowledge: "産後ケア事業の利用要件",
    specialtyId: "maternal-child",
    title: "母子訪問での疲労蓄積アセスメント演習",
  },
  {
    constraints: "認知機能の評価は本演習の対象外。",
    difficultyId: "beginner",
    evaluationCriteria: [
      "外出頻度の変化のような中間の O を明示できているか。",
      "社会的孤立・転倒リスクなど複数の観点を検討しているか。",
      "地域資源への繋ぎ方が支援方針に反映されているか。",
    ],
    expectedWorkScene: "独居高齢者への定期訪問",
    followupQuestions: [
      {
        id: "case-2-q1",
        questionText: "直近1ヶ月の外出頻度の変化を確認する",
        revealedInfoText:
          "月に10回程度あった外出が、直近は週1回程度に減っている。",
      },
      {
        id: "case-2-q2",
        questionText: "自宅内でのふらつきの有無を確認する",
        revealedInfoText:
          "自宅内での歩行は安定しており、ふらつきは屋外でのみ見られる。",
      },
    ],
    id: "case-2",
    initialPresentation:
      "本人から「一人で買い物に行くのが不安になってきた」と発言。屋外歩行時にふらつきが見られる。",
    learningThemeId: "risk-detection",
    modelAnswers: [
      {
        acceptableNote: "外出頻度という中間の O を明示できているパターン。",
        answerType: "soap",
        content:
          "S: 一人で買い物に行くのが不安。O: 屋外歩行時のふらつき、外出頻度は月10回から週1回へ減少。",
        id: "case-2-model-soap-1",
      },
      {
        acceptableNote: "社会的孤立の観点。",
        answerType: "assessment",
        content:
          "屋外での活動範囲縮小により、社会的孤立のリスクが高まっている。",
        id: "case-2-model-assessment-1",
      },
      {
        acceptableNote: "転倒リスクの観点も妥当なパターン。",
        answerType: "assessment",
        content: "屋外歩行時のふらつきが転倒リスクの兆候である可能性がある。",
        id: "case-2-model-assessment-2",
      },
      {
        acceptableNote: "見守り・移動支援を軸にしたパターン。",
        answerType: "support_plan",
        content:
          "地域の見守り・移動支援サービスの利用について本人・家族と相談する。",
        id: "case-2-model-plan-1",
      },
      {
        acceptableNote:
          "地域包括支援センターとの連携を軸にしたパターンも許容する。",
        answerType: "support_plan",
        content: "地域包括支援センターと連携し、転倒リスク評価を依頼する。",
        id: "case-2-model-plan-2",
      },
    ],
    requiredInstitutionalKnowledge: "地域包括支援センターへの繋ぎ方",
    specialtyId: "elderly-care",
    title: "外出頻度低下からのリスク早期発見演習",
  },
  {
    constraints: "診断的な評価は行わない。",
    difficultyId: "advanced",
    evaluationCriteria: [
      "曖昧な形容表現を頻度・期間などの具体情報に置き換えているか。",
      "S/O の混在がないか。",
      "支援方針に受診勧奨等の次のアクションが明記されているか。",
    ],
    expectedWorkScene: "精神保健相談後の記録作成",
    followupQuestions: [
      {
        id: "case-3-q1",
        questionText: "落ち込みの頻度・期間を確認する",
        revealedInfoText: "ほぼ毎日、2週間ほど続いている。",
      },
      {
        id: "case-3-q2",
        questionText: "睡眠・食欲の変化を確認する",
        revealedInfoText: "食欲不振があり、体重減少もみられる。",
      },
    ],
    id: "case-3",
    initialPresentation:
      "本人から「最近、気分の落ち込みが多い」と発言。表情は乏しく、声量は小さい。",
    learningThemeId: "documentation",
    modelAnswers: [
      {
        acceptableNote: "頻度・期間を具体化できているパターン。",
        answerType: "soap",
        content:
          "S: 気分の落ち込みが多い（ほぼ毎日、2週間継続）。O: 表情に乏しさ、声量が小さい、食欲不振・体重減少。",
        id: "case-3-model-soap-1",
      },
      {
        acceptableNote: "期間・身体症状を根拠にしたパターン。",
        answerType: "assessment",
        content:
          "2週間続く気分の落ち込みと食欲不振・体重減少から、専門医療への繋ぎが必要な状態と考えられる。",
        id: "case-3-model-assessment-1",
      },
      {
        acceptableNote: "受診勧奨を軸にしたパターン。",
        answerType: "support_plan",
        content: "精神科受診を勧奨し、受診状況を次回確認する。",
        id: "case-3-model-plan-1",
      },
    ],
    requiredInstitutionalKnowledge: "精神保健福祉法に基づく相談記録の要件",
    specialtyId: "mental-health",
    title: "記録表現の曖昧さを解消する演習",
  },
];

let attempts: ExerciseAttempt[] = [
  {
    answers: {
      additionalConfirmationText:
        "パートナーの育児参加状況、母親自身の睡眠環境。",
      assessmentText:
        "産後の睡眠不足による疲労蓄積のリスク。パートナーの育児参加が限定的。",
      soapText:
        "S: 夜間授乳がつらく眠れていない。O: 体重増加は標準曲線内、表情に疲労。",
      supportPlanText: "家事・育児支援サービスの利用を提案する。",
    },
    exerciseCaseId: "case-1",
    id: "attempt-seed-1",
    revealedFollowupQuestionIds: ["case-1-q1"],
    startedAt: "2026-07-20T09:00:00.000Z",
    status: "feedback_ready",
    submittedAt: "2026-07-20T09:20:00.000Z",
    traineeName: "初田 trainee",
  },
  {
    answers: {
      additionalConfirmationText: "自宅内でのふらつきの有無。",
      assessmentText:
        "屋外での活動範囲縮小により社会的孤立のリスクが高まっている。",
      soapText: "S: 一人で買い物に行くのが不安。O: 屋外歩行時のふらつき。",
      supportPlanText: "地域の見守りサービスの利用について相談する。",
    },
    exerciseCaseId: "case-2",
    id: "attempt-seed-2",
    revealedFollowupQuestionIds: ["case-2-q2"],
    startedAt: "2026-07-25T09:00:00.000Z",
    status: "feedback_ready",
    submittedAt: "2026-07-25T09:15:00.000Z",
    traineeName: "新人保健師（デモ）",
  },
];

function requireExerciseCase(id: string): ExerciseCase {
  const exerciseCase = EXERCISE_CASES.find((item) => item.id === id);
  if (!exerciseCase) {
    throw new Error(`unknown seed exercise case: ${id}`);
  }
  return exerciseCase;
}

let feedbacks: ExerciseFeedback[] = [
  generateDummyFeedback(requireExerciseCase("case-1"), "attempt-seed-1"),
  generateDummyFeedback(requireExerciseCase("case-2"), "attempt-seed-2"),
].map((feedback, index) => ({ ...feedback, id: `feedback-seed-${index + 1}` }));

let instructorComments: ExerciseInstructorComment[] = [
  {
    body: "パートナーの育児参加状況まで確認できている点が良い。次は本人の睡眠環境にも触れられるとさらに良くなる。",
    createdAt: "2026-07-21T09:00:00.000Z",
    feedbackId: "feedback-seed-1",
    id: "instructor-comment-seed-1",
    instructorName: "鈴木 instructor",
  },
];

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export async function listExerciseCases(
  filters: ExerciseCaseFilters = {},
): Promise<ExerciseCase[]> {
  return delay(filterExerciseCases(EXERCISE_CASES, filters));
}

export function getExerciseCaseById(id: string): ExerciseCase | undefined {
  return EXERCISE_CASES.find((exerciseCase) => exerciseCase.id === id);
}

export async function startAttempt(
  exerciseCaseId: string,
  traineeName: string,
): Promise<ExerciseAttempt> {
  attempts = startExerciseAttempt(attempts, { exerciseCaseId, traineeName });
  const created = attempts[attempts.length - 1];
  if (!created) {
    throw new Error("failed to start attempt");
  }
  return delay(created);
}

export async function revealFollowup(
  attemptId: string,
  questionId: string,
): Promise<ExerciseAttempt[]> {
  attempts = revealFollowupQuestion(attempts, attemptId, questionId);
  return delay(attempts);
}

export async function saveDraftAnswers(
  attemptId: string,
  answers: ExerciseAttemptAnswers,
): Promise<ExerciseAttempt[]> {
  attempts = withDraftAnswers(attempts, attemptId, answers);
  return delay(attempts);
}

export type SubmitAttemptResult = {
  attempt: ExerciseAttempt;
  feedback: ExerciseFeedback;
};

/**
 * 提出と同時に AI フィードバックを生成する（実装では BFF が AgentCore の単発 agent を
 * 呼ぶ経路になる想定。dummy データ段階では `generateDummyFeedback` で即時に代替する）。
 */
export async function submitAttemptAndGenerateFeedback(
  attemptId: string,
): Promise<SubmitAttemptResult> {
  attempts = submitExerciseAttempt(attempts, attemptId);
  const attempt = attempts.find((item) => item.id === attemptId);
  if (!attempt) {
    throw new Error("attempt not found");
  }
  const exerciseCase = getExerciseCaseById(attempt.exerciseCaseId);
  if (!exerciseCase) {
    throw new Error("exercise case not found");
  }
  const feedback = generateDummyFeedback(exerciseCase, attemptId);
  feedbacks = [...feedbacks, feedback];
  attempts = attempts.map((item) =>
    item.id === attemptId ? { ...item, status: "feedback_ready" } : item,
  );
  const updated = attempts.find((item) => item.id === attemptId);
  if (!updated) {
    throw new Error("attempt not found after update");
  }
  return delay({ attempt: updated, feedback });
}

export async function listAttemptsForTrainee(
  traineeName: string,
): Promise<ExerciseAttempt[]> {
  return delay(attemptsForTrainee(attempts, traineeName));
}

export async function listInstructorQueue(): Promise<ExerciseAttempt[]> {
  return delay(
    attempts.filter(
      (attempt) =>
        attempt.status === "submitted" || attempt.status === "feedback_ready",
    ),
  );
}

export function getFeedbackForAttempt(
  attemptId: string,
): ExerciseFeedback | undefined {
  return feedbacks.find((feedback) => feedback.attemptId === attemptId);
}

export async function listInstructorComments(
  feedbackId: string,
): Promise<ExerciseInstructorComment[]> {
  return delay(commentsForFeedback(instructorComments, feedbackId));
}

export async function postInstructorComment(
  feedbackId: string,
  instructorName: string,
  body: string,
): Promise<ExerciseInstructorComment[]> {
  instructorComments = addInstructorCommentToList(
    instructorComments,
    feedbackId,
    instructorName,
    body,
  );
  return delay(instructorComments);
}
