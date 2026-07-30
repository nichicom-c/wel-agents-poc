/**
 * issue #9 の Acceptance Criteria が定義するフィードバックの5観点。実装では BFF が回答内容と
 * 模範回答・評価観点を AgentCore の演習フィードバック agent（`packages/agentcore` の
 * `exercise_feedback_agent`。soap_draft/soap_gaps と同型、無状態）へ渡して生成し、BFF
 * `/api/exercise-attempts/{id}/submit` の応答に埋め込んで返す。
 */
export type ExerciseFeedbackGeneratedBy = "ai" | "instructor";

export type ExerciseInstructorComment = {
  id: string;
  instructorId: string;
  instructorName: string;
  body: string;
  createdAt: string;
};

export type ExerciseFeedback = {
  id: string;
  attemptId: string;
  generatedBy: ExerciseFeedbackGeneratedBy;
  dataCollectionNote: string;
  rationaleNote: string;
  assessmentNote: string;
  supportPlanNote: string;
  documentationNote: string;
  createdAt: string;
  instructorComments: ExerciseInstructorComment[];
};
