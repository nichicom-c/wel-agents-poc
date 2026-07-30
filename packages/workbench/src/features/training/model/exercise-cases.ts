/**
 * issue #9 の Technical Approach に定義された演習ケースの構造。実装では issue #10 の
 * `materials`（`material_type: "teaching_case"`）の拡張テーブルとして持つ設計だが
 * （`docs/notes/2026-07-30-...` 参照）、`admin` feature と同様 dummy データ段階では
 * このモジュールに閉じた独立データとして持つ。
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
  acceptableNote: string;
};

export type ExerciseCase = {
  id: string;
  title: string;
  specialtyId: string;
  difficultyId: string;
  learningThemeId: string;
  /** 想定業務場面。 */
  expectedWorkScene: string;
  /** 必要な制度知識。 */
  requiredInstitutionalKnowledge: string;
  /** 初期提示情報。 */
  initialPresentation: string;
  /** 制約条件。 */
  constraints: string;
  followupQuestions: ExerciseFollowupQuestion[];
  modelAnswers: ExerciseModelAnswer[];
  /** 評価観点。issue #10 の rubric と連携する想定だが、dummy データ段階では文字列配列で持つ。 */
  evaluationCriteria: string[];
};

export type ExerciseCaseFilters = {
  specialtyId?: string;
  difficultyId?: string;
  learningThemeId?: string;
};

export function filterExerciseCases(
  cases: readonly ExerciseCase[],
  filters: ExerciseCaseFilters,
): ExerciseCase[] {
  return cases.filter(
    (exerciseCase) =>
      (!filters.specialtyId ||
        exerciseCase.specialtyId === filters.specialtyId) &&
      (!filters.difficultyId ||
        exerciseCase.difficultyId === filters.difficultyId) &&
      (!filters.learningThemeId ||
        exerciseCase.learningThemeId === filters.learningThemeId),
  );
}

export function modelAnswersOfType(
  exerciseCase: ExerciseCase,
  answerType: ModelAnswerType,
): ExerciseModelAnswer[] {
  return exerciseCase.modelAnswers.filter(
    (answer) => answer.answerType === answerType,
  );
}
