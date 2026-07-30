import { createId } from "./create-id.ts";
import type { ExerciseCase } from "./exercise-cases.ts";

/** issue #9 の Acceptance Criteria が定義するフィードバックの5観点。 */
export type ExerciseFeedbackGeneratedBy = "ai" | "instructor";

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
};

export type ExerciseInstructorComment = {
  id: string;
  feedbackId: string;
  instructorName: string;
  body: string;
  createdAt: string;
};

/**
 * 実装では BFF が回答内容と模範回答・評価観点を AgentCore の単発 agent（`soap_draft` /
 * `soap_gaps` と同型、無状態）へ渡して生成する想定（`docs/notes/2026-07-30-...` の
 * シーケンス図を参照）。dummy データ段階ではその代わりに、ケースの評価観点・想定業務場面から
 * 決定的なテンプレート文を組み立てるだけの簡易版で UI を検証する。
 */
export function generateDummyFeedback(
  exerciseCase: ExerciseCase,
  attemptId: string,
): ExerciseFeedback {
  const criteria = exerciseCase.evaluationCriteria;
  return {
    assessmentNote:
      criteria[0] ??
      "アセスメントが O/S の内容から論理的に導けているか確認しましょう。",
    attemptId,
    createdAt: new Date().toISOString(),
    dataCollectionNote: `想定業務場面（${exerciseCase.expectedWorkScene}）に関連する追加確認事項を、もう1つ挙げられるか振り返ってみましょう。`,
    documentationNote:
      "曖昧な表現（「多め」「少し」等）を数値や具体的な状況で言い換えられるか確認しましょう。",
    generatedBy: "ai",
    id: createId("feedback"),
    rationaleNote:
      criteria[1] ??
      "S/O の記載が A の結論を実際に支えているか、根拠を明示しましょう。",
    supportPlanNote:
      criteria[2] ??
      "次回までの確認事項を、支援方針の中に具体的に含められているか確認しましょう。",
  };
}

export function addInstructorComment(
  comments: readonly ExerciseInstructorComment[],
  feedbackId: string,
  instructorName: string,
  body: string,
): ExerciseInstructorComment[] {
  return [
    ...comments,
    {
      body,
      createdAt: new Date().toISOString(),
      feedbackId,
      id: createId("instructor-comment"),
      instructorName,
    },
  ];
}

export function commentsForFeedback(
  comments: readonly ExerciseInstructorComment[],
  feedbackId: string,
): ExerciseInstructorComment[] {
  return comments.filter((comment) => comment.feedbackId === feedbackId);
}
