import { describe, expect, test } from "bun:test";

import { type ExerciseCase, modelAnswersOfType } from "./exercise-cases.ts";

const BASE_CASE: ExerciseCase = {
  evaluationCriteria: [],
  followupQuestions: [],
  id: "case-1",
  initialPresentation: "",
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
  title: "case-1",
};

describe("modelAnswersOfType", () => {
  test("指定した答案種別の模範回答だけを返す（複数の妥当なパターンを保持する）", () => {
    const result = modelAnswersOfType(BASE_CASE, "assessment");
    expect(result).toHaveLength(2);
    expect(result.map((answer) => answer.id)).toEqual(["answer-2", "answer-3"]);
  });

  test("該当する模範回答が無ければ空配列を返す", () => {
    expect(modelAnswersOfType(BASE_CASE, "support_plan")).toHaveLength(0);
  });
});
