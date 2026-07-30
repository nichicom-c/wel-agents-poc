import { describe, expect, test } from "bun:test";
import type { ExerciseCase } from "./exercise-cases.ts";
import {
  addInstructorComment,
  commentsForFeedback,
  type ExerciseInstructorComment,
  generateDummyFeedback,
} from "./exercise-feedback.ts";

const BASE_CASE: ExerciseCase = {
  constraints: "",
  difficultyId: "beginner",
  evaluationCriteria: ["criterion-1", "criterion-2", "criterion-3"],
  expectedWorkScene: "scene-1",
  followupQuestions: [],
  id: "case-1",
  initialPresentation: "",
  learningThemeId: "assessment-basics",
  modelAnswers: [],
  requiredInstitutionalKnowledge: "",
  specialtyId: "maternal-child",
  title: "case-1",
};

describe("generateDummyFeedback", () => {
  test("5観点すべてを含み、評価観点をアセスメント/根拠/支援方針のテンプレートに使う", () => {
    const feedback = generateDummyFeedback(BASE_CASE, "attempt-1");

    expect(feedback.attemptId).toBe("attempt-1");
    expect(feedback.generatedBy).toBe("ai");
    expect(feedback.assessmentNote).toBe("criterion-1");
    expect(feedback.rationaleNote).toBe("criterion-2");
    expect(feedback.supportPlanNote).toBe("criterion-3");
    expect(feedback.dataCollectionNote.length).toBeGreaterThan(0);
    expect(feedback.documentationNote.length).toBeGreaterThan(0);
  });

  test("評価観点が不足していても fallback の汎用文を使う", () => {
    const feedback = generateDummyFeedback(
      { ...BASE_CASE, evaluationCriteria: [] },
      "attempt-1",
    );

    expect(feedback.assessmentNote.length).toBeGreaterThan(0);
    expect(feedback.rationaleNote.length).toBeGreaterThan(0);
    expect(feedback.supportPlanNote.length).toBeGreaterThan(0);
  });
});

describe("addInstructorComment / commentsForFeedback", () => {
  test("指定したフィードバックへコメントを追加できる", () => {
    const updated = addInstructorComment(
      [],
      "feedback-1",
      "instructor-a",
      "body text",
    );

    expect(updated).toHaveLength(1);
    expect(updated[0]?.feedbackId).toBe("feedback-1");
    expect(updated[0]?.instructorName).toBe("instructor-a");
  });

  test("指定したフィードバックのコメントだけを返す", () => {
    const comments: ExerciseInstructorComment[] = [
      ...addInstructorComment([], "feedback-1", "instructor-a", "a"),
      ...addInstructorComment([], "feedback-2", "instructor-b", "b"),
    ];

    expect(commentsForFeedback(comments, "feedback-1")).toHaveLength(1);
  });
});
