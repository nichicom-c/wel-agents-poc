/**
 * issue #9 の Technical Approach に定義された演習ケースの構造。issue #10 の `materials`
 * （`material_type: "teaching_case"`）の1:1拡張として BFF `/api/exercise-cases`
 * （Aurora Serverless v2 + RDS Data API）から取得する。
 */
export type ExerciseFollowupQuestion = {
  id: string;
  /** 追加質問で得られる情報の設問文。 */
  questionText: string;
  /** その設問を選んだ場合に開示される追加情報。 */
  revealedInfoText: string;
};

export const MODEL_ANSWER_TYPES = [
  "soap",
  "assessment",
  "support_plan",
] as const;

export type ModelAnswerType = (typeof MODEL_ANSWER_TYPES)[number];

const MODEL_ANSWER_TYPE_LABELS: Record<ModelAnswerType, string> = {
  assessment: "アセスメント",
  soap: "SOAP（情報収集）",
  support_plan: "支援方針",
};

export function modelAnswerTypeLabel(type: ModelAnswerType): string {
  return MODEL_ANSWER_TYPE_LABELS[type];
}

export type ExerciseModelAnswer = {
  id: string;
  answerType: ModelAnswerType;
  content: string;
  /** 単一正解ではなく複数の妥当な判断パターンのうち、この解答が許容される理由。 */
  acceptableNote?: string;
};

export type ExerciseCase = {
  id: string;
  title: string;
  specialtyId?: string;
  difficultyId?: string;
  learningThemeId?: string;
  /** 想定業務場面。 */
  expectedWorkScene?: string;
  /** 必要な制度知識。 */
  requiredInstitutionalKnowledge?: string;
  /** 初期提示情報。 */
  initialPresentation: string;
  /** 制約条件。 */
  constraintsText?: string;
  followupQuestions: ExerciseFollowupQuestion[];
  modelAnswers: ExerciseModelAnswer[];
  /** issue #10 のルーブリック（`exercise_case_rubrics` 経由）から集めた評価観点。 */
  evaluationCriteria: string[];
};

export type ExerciseCaseFilters = {
  specialtyId?: string;
  difficultyId?: string;
  learningThemeId?: string;
};

export function modelAnswersOfType(
  exerciseCase: ExerciseCase,
  answerType: ModelAnswerType,
): ExerciseModelAnswer[] {
  return exerciseCase.modelAnswers.filter(
    (answer) => answer.answerType === answerType,
  );
}
