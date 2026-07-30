import { describe, expect, test } from "bun:test";

import {
  type ExerciseCase,
  filterExerciseCases,
  modelAnswersOfType,
} from "./exercise-cases.ts";

const BASE_CASES: ExerciseCase[] = [
  {
    constraints: "",
    difficultyId: "beginner",
    evaluationCriteria: [],
    expectedWorkScene: "",
    followupQuestions: [],
    id: "case-1",
    initialPresentation: "",
    learningThemeId: "assessment-basics",
    modelAnswers: [
      {
        acceptableNote: "note-1",
        answerType: "soap",
        content: "content-1",
        id: "answer-1",
      },
      {
        acceptableNote: "note-2",
        answerType: "assessment",
        content: "content-2",
        id: "answer-2",
      },
      {
        acceptableNote: "note-3",
        answerType: "assessment",
        content: "content-3",
        id: "answer-3",
      },
    ],
    requiredInstitutionalKnowledge: "",
    specialtyId: "maternal-child",
    title: "case-1",
  },
  {
    constraints: "",
    difficultyId: "advanced",
    evaluationCriteria: [],
    expectedWorkScene: "",
    followupQuestions: [],
    id: "case-2",
    initialPresentation: "",
    learningThemeId: "risk-detection",
    modelAnswers: [],
    requiredInstitutionalKnowledge: "",
    specialtyId: "elderly-care",
    title: "case-2",
  },
];

describe("filterExerciseCases", () => {
  test("フィルタ無しでは全件を返す", () => {
    expect(filterExerciseCases(BASE_CASES, {})).toHaveLength(2);
  });

  test("specialtyId / difficultyId / learningThemeId を組み合わせて絞り込める", () => {
    const result = filterExerciseCases(BASE_CASES, {
      difficultyId: "beginner",
      learningThemeId: "assessment-basics",
      specialtyId: "maternal-child",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("case-1");
  });

  test("該当しない条件では空配列を返す", () => {
    expect(
      filterExerciseCases(BASE_CASES, { specialtyId: "mental-health" }),
    ).toHaveLength(0);
  });
});

describe("modelAnswersOfType", () => {
  test("指定した答案種別の模範回答だけを返す（複数の妥当なパターンを保持する）", () => {
    const result = modelAnswersOfType(
      BASE_CASES[0] as ExerciseCase,
      "assessment",
    );
    expect(result).toHaveLength(2);
    expect(result.map((answer) => answer.id)).toEqual(["answer-2", "answer-3"]);
  });

  test("該当する模範回答が無ければ空配列を返す", () => {
    expect(
      modelAnswersOfType(BASE_CASES[1] as ExerciseCase, "soap"),
    ).toHaveLength(0);
  });
});
