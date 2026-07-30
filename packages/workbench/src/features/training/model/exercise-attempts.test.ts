import { describe, expect, test } from "bun:test";

import {
  attemptsForTrainee,
  type ExerciseAttempt,
  revealFollowupQuestion,
  startExerciseAttempt,
  submitExerciseAttempt,
  withDraftAnswers,
} from "./exercise-attempts.ts";

describe("startExerciseAttempt", () => {
  test("status: in_progress で新規回答を追加する", () => {
    const updated = startExerciseAttempt([], {
      exerciseCaseId: "case-1",
      traineeName: "trainee-a",
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]?.status).toBe("in_progress");
    expect(updated[0]?.revealedFollowupQuestionIds).toHaveLength(0);
    expect(typeof updated[0]?.id).toBe("string");
  });
});

describe("revealFollowupQuestion", () => {
  const base = startExerciseAttempt([], {
    exerciseCaseId: "case-1",
    traineeName: "trainee-a",
  });
  const attemptId = base[0]?.id ?? "";

  test("指定した質問 id を revealedFollowupQuestionIds に追加する", () => {
    const updated = revealFollowupQuestion(base, attemptId, "q1");
    expect(
      updated.find((a) => a.id === attemptId)?.revealedFollowupQuestionIds,
    ).toEqual(["q1"]);
  });

  test("同じ質問 id を重複して追加しない", () => {
    const once = revealFollowupQuestion(base, attemptId, "q1");
    const twice = revealFollowupQuestion(once, attemptId, "q1");
    expect(
      twice.find((a) => a.id === attemptId)?.revealedFollowupQuestionIds,
    ).toEqual(["q1"]);
  });
});

describe("withDraftAnswers / submitExerciseAttempt", () => {
  test("回答内容を更新できる", () => {
    const base = startExerciseAttempt([], {
      exerciseCaseId: "case-1",
      traineeName: "trainee-a",
    });
    const attemptId = base[0]?.id ?? "";
    const updated = withDraftAnswers(base, attemptId, {
      additionalConfirmationText: "confirmation",
      assessmentText: "assessment",
      soapText: "soap",
      supportPlanText: "plan",
    });

    expect(updated.find((a) => a.id === attemptId)?.answers.soapText).toBe(
      "soap",
    );
  });

  test("提出すると status: submitted になり submittedAt が付与される", () => {
    const base = startExerciseAttempt([], {
      exerciseCaseId: "case-1",
      traineeName: "trainee-a",
    });
    const attemptId = base[0]?.id ?? "";
    const updated = submitExerciseAttempt(base, attemptId);
    const submitted = updated.find((a) => a.id === attemptId);

    expect(submitted?.status).toBe("submitted");
    expect(typeof submitted?.submittedAt).toBe("string");
  });
});

describe("attemptsForTrainee", () => {
  const ATTEMPTS: ExerciseAttempt[] = [
    ...startExerciseAttempt([], {
      exerciseCaseId: "case-1",
      traineeName: "trainee-a",
    }),
    ...startExerciseAttempt([], {
      exerciseCaseId: "case-2",
      traineeName: "trainee-b",
    }),
  ];

  test("指定した受講者の回答だけを返す", () => {
    expect(attemptsForTrainee(ATTEMPTS, "trainee-a")).toHaveLength(1);
  });

  test("該当する受講者が無ければ空配列を返す", () => {
    expect(attemptsForTrainee(ATTEMPTS, "trainee-c")).toHaveLength(0);
  });
});
