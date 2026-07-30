import type {
  ExerciseFeedbackAnswers,
  ExerciseFeedbackCaseContext,
  ExerciseModelAnswerContext,
  ModelAnswerType,
} from "../contracts/exercise-feedback.ts";
import { MODEL_ANSWER_TYPES } from "../contracts/exercise-feedback.ts";
import type { RuntimeRequest } from "../contracts/runtime.ts";

/** payload が演習フィードバック生成リクエストかどうか。 */
export function isExerciseFeedbackRequest(payload: RuntimeRequest): boolean {
  return payload.type === "exercise_feedback";
}

/** payload から演習ケースの文脈を取り出す。`title` / `initialPresentation` が無ければ undefined。 */
export function getExerciseFeedbackCaseContext(
  payload: RuntimeRequest,
): ExerciseFeedbackCaseContext | undefined {
  const record = asRecord(payload.exercise_case);
  const title = textField(record.title);
  const initialPresentation = textField(record.initialPresentation);
  if (!title || !initialPresentation) {
    return undefined;
  }

  return {
    constraintsText: textField(record.constraintsText) || undefined,
    evaluationCriteria: stringArray(record.evaluationCriteria),
    expectedWorkScene: textField(record.expectedWorkScene) || undefined,
    initialPresentation,
    modelAnswers: modelAnswerArray(record.modelAnswers),
    requiredInstitutionalKnowledge:
      textField(record.requiredInstitutionalKnowledge) || undefined,
    title,
  };
}

/**
 * payload から受講者の提出物を取り出す。SOAP・アセスメント・支援方針は演習の回答フォームで
 * 必須のため無ければ undefined（追加確認事項だけは任意項目のため空文字を許容する）。
 */
export function getExerciseFeedbackAnswers(
  payload: RuntimeRequest,
): ExerciseFeedbackAnswers | undefined {
  const record = asRecord(payload.exercise_answers);
  const soapText = textField(record.soapText);
  const assessmentText = textField(record.assessmentText);
  const supportPlanText = textField(record.supportPlanText);
  if (!soapText || !assessmentText || !supportPlanText) {
    return undefined;
  }

  return {
    additionalConfirmationText: textField(record.additionalConfirmationText),
    assessmentText,
    soapText,
    supportPlanText,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => textField(entry))
    .filter((entry) => entry.length > 0);
}

function isModelAnswerType(value: unknown): value is ModelAnswerType {
  return (
    typeof value === "string" &&
    (MODEL_ANSWER_TYPES as readonly string[]).includes(value)
  );
}

function modelAnswerArray(value: unknown): ExerciseModelAnswerContext[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): ExerciseModelAnswerContext | undefined => {
      const record = asRecord(entry);
      const answerType = record.answerType;
      const content = textField(record.content);
      if (!isModelAnswerType(answerType) || !content) {
        return undefined;
      }
      return {
        acceptableNote: textField(record.acceptableNote) || undefined,
        answerType,
        content,
      };
    })
    .filter(
      (entry): entry is ExerciseModelAnswerContext => entry !== undefined,
    );
}
