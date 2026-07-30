import { z } from "zod";

/**
 * 新人保健師向け演習（issue #9）の提出物に対する AI フィードバック。5観点
 * （情報収集/根拠/アセスメント/支援方針/記録表現）は issue #9 の Acceptance Criteria が
 * 定義する固定の観点。
 */

export const MODEL_ANSWER_TYPES = [
  "soap",
  "assessment",
  "support_plan",
] as const;

export type ModelAnswerType = (typeof MODEL_ANSWER_TYPES)[number];

export type ExerciseModelAnswerContext = {
  answerType: ModelAnswerType;
  content: string;
  acceptableNote?: string;
};

/** 演習ケースの文脈（初期提示情報・評価観点・模範回答）。 */
export type ExerciseFeedbackCaseContext = {
  title: string;
  initialPresentation: string;
  expectedWorkScene?: string;
  constraintsText?: string;
  requiredInstitutionalKnowledge?: string;
  /** issue #10 のルーブリック（`rubric_items.criterion_name` 等）から集めた評価観点。 */
  evaluationCriteria: string[];
  modelAnswers: ExerciseModelAnswerContext[];
};

/** 受講者の提出物。 */
export type ExerciseFeedbackAnswers = {
  soapText: string;
  additionalConfirmationText: string;
  assessmentText: string;
  supportPlanText: string;
};

export const exerciseFeedbackOutputSchema = z.object({
  dataCollectionNote: z
    .string()
    .min(1)
    .describe(
      "情報収集の改善点（追加確認事項の妥当性・不足）についてのコメント。",
    ),
  rationaleNote: z
    .string()
    .min(1)
    .describe(
      "S/O の記載が A（アセスメント）の結論を実際に支えているかについてのコメント。",
    ),
  assessmentNote: z
    .string()
    .min(1)
    .describe(
      "アセスメントの妥当性についてのコメント。模範回答と比較した観点を含める。",
    ),
  supportPlanNote: z
    .string()
    .min(1)
    .describe("支援方針の妥当性・具体性についてのコメント。"),
  documentationNote: z
    .string()
    .min(1)
    .describe("記録表現（曖昧な表現の有無等）についてのコメント。"),
});

export type ExerciseFeedbackOutput = z.infer<
  typeof exerciseFeedbackOutputSchema
>;
