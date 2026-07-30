import { describe, expect, test } from "bun:test";

import {
  getExerciseFeedbackAnswers,
  getExerciseFeedbackCaseContext,
  isExerciseFeedbackRequest,
} from "./exercise-feedback.ts";

describe("isExerciseFeedbackRequest", () => {
  test("type: exercise_feedback のときだけ true", () => {
    expect(isExerciseFeedbackRequest({ type: "exercise_feedback" })).toBe(true);
    expect(isExerciseFeedbackRequest({})).toBe(false);
    expect(isExerciseFeedbackRequest({ type: "soap_draft" })).toBe(false);
  });
});

describe("getExerciseFeedbackCaseContext", () => {
  test("title / initialPresentation が無ければ undefined", () => {
    expect(getExerciseFeedbackCaseContext({})).toBeUndefined();
    expect(
      getExerciseFeedbackCaseContext({
        exercise_case: { title: "case" },
      }),
    ).toBeUndefined();
  });

  test("有効な値を trim して取り出し、任意項目は省略可能", () => {
    const result = getExerciseFeedbackCaseContext({
      exercise_case: {
        evaluationCriteria: ["  criterion-1  ", "", "criterion-2"],
        initialPresentation: "  presentation  ",
        modelAnswers: [
          { answerType: "soap", content: "content-1" },
          { answerType: "x", content: "invalid answer type" },
          { answerType: "assessment", content: "" },
        ],
        title: "  case title  ",
      },
    });

    expect(result).toEqual({
      constraintsText: undefined,
      evaluationCriteria: ["criterion-1", "criterion-2"],
      expectedWorkScene: undefined,
      initialPresentation: "presentation",
      modelAnswers: [
        { acceptableNote: undefined, answerType: "soap", content: "content-1" },
      ],
      requiredInstitutionalKnowledge: undefined,
      title: "case title",
    });
  });
});

describe("getExerciseFeedbackAnswers", () => {
  test("soapText / assessmentText / supportPlanText のいずれかが無ければ undefined", () => {
    expect(getExerciseFeedbackAnswers({})).toBeUndefined();
    expect(
      getExerciseFeedbackAnswers({
        exercise_answers: { assessmentText: "a", soapText: "s" },
      }),
    ).toBeUndefined();
  });

  test("additionalConfirmationText は空文字を許容する", () => {
    const result = getExerciseFeedbackAnswers({
      exercise_answers: {
        assessmentText: "assessment",
        soapText: "soap",
        supportPlanText: "plan",
      },
    });

    expect(result).toEqual({
      additionalConfirmationText: "",
      assessmentText: "assessment",
      soapText: "soap",
      supportPlanText: "plan",
    });
  });
});
