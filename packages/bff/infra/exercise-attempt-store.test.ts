import { describe, expect, test } from "bun:test";

import {
  attachFeedback,
  getAttemptById,
  listAttemptsForTrainee,
  listInstructorQueue,
  markAttemptSubmitted,
  revealFollowup,
  saveDraftAnswers,
  startAttempt,
} from "./exercise-attempt-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

const EXERCISE_CASE_JSON = {
  evaluationCriteria: [],
  followupQuestions: [],
  id: "case-1",
  initialPresentation: "母親から夜間の授乳がつらいと発言。",
  modelAnswers: [],
  title: "母子訪問での疲労蓄積アセスメント演習",
};

const ATTEMPT_ROW = {
  answer_assessment: "疲労蓄積のリスクがある。",
  answer_followups: JSON.stringify(["q-1"]),
  answer_soap: JSON.stringify({
    additionalConfirmationText: "パートナーの育児参加状況。",
    soapText: "S: 夜間の授乳がつらい。",
  }),
  answer_support_plan: "育児支援サービスの利用を提案する。",
  exercise_case: JSON.stringify(EXERCISE_CASE_JSON),
  feedback: null,
  id: "attempt-1",
  started_at: "2026-07-20T09:00:00.000Z",
  status: "in_progress",
  submitted_at: null,
  trainee_id: "11111111-1111-1111-1111-111111111111",
  trainee_name: "初田 trainee",
};

type RecordedCall = { name: string; sql?: string };

class FakeRdsDataClient {
  readonly calls: RecordedCall[] = [];
  private txCounter = 0;

  async send(command: {
    constructor: { name: string };
    input?: Record<string, unknown>;
  }): Promise<unknown> {
    const name = command.constructor.name;
    const sql =
      typeof command.input?.sql === "string" ? command.input.sql : undefined;
    this.calls.push({ name, sql });

    if (name === "BeginTransactionCommand") {
      this.txCounter += 1;
      return { transactionId: `tx-${this.txCounter}` };
    }
    if (
      name === "CommitTransactionCommand" ||
      name === "RollbackTransactionCommand"
    ) {
      return {};
    }
    if (name !== "ExecuteStatementCommand" || !sql) {
      throw new Error(`unexpected command: ${name}`);
    }

    if (sql.includes("insert into app_users")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("insert into exercise_attempts")) {
      return { formattedRecords: JSON.stringify([{ id: "attempt-1" }]) };
    }
    if (sql.includes("select answer_followups from exercise_attempts")) {
      return {
        formattedRecords: JSON.stringify([
          { answer_followups: JSON.stringify([]) },
        ]),
      };
    }
    if (sql.includes("update exercise_attempts set answer_followups")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("set answer_soap = :answerSoap")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("set status = 'submitted'")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("insert into exercise_feedback")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("set status = 'feedback_ready'")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("where ea.id = :id")) {
      return { formattedRecords: JSON.stringify([ATTEMPT_ROW]) };
    }
    if (sql.includes("where ea.trainee_id")) {
      return { formattedRecords: JSON.stringify([ATTEMPT_ROW]) };
    }
    if (sql.includes("where ea.status in")) {
      return { formattedRecords: JSON.stringify([ATTEMPT_ROW]) };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

const EXPECTED_ATTEMPT = {
  answers: {
    additionalConfirmationText: "パートナーの育児参加状況。",
    assessmentText: "疲労蓄積のリスクがある。",
    soapText: "S: 夜間の授乳がつらい。",
    supportPlanText: "育児支援サービスの利用を提案する。",
  },
  exerciseCase: EXERCISE_CASE_JSON,
  feedback: undefined,
  id: "attempt-1",
  revealedFollowupQuestionIds: ["q-1"],
  startedAt: "2026-07-20T09:00:00.000Z",
  status: "in_progress" as const,
  submittedAt: undefined,
  traineeId: "11111111-1111-1111-1111-111111111111",
  traineeName: "初田 trainee",
};

describe("getAttemptById", () => {
  test("embed された exercise_case / feedback を変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await getAttemptById(CONFIG, "attempt-1", {
      client: client as never,
    });

    expect(result).toEqual(EXPECTED_ATTEMPT);
  });
});

describe("startAttempt", () => {
  test("in_progress で作り、作成後の受講記録を返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await startAttempt(
      CONFIG,
      {
        exerciseCaseId: "case-1",
        traineeId: "11111111-1111-1111-1111-111111111111",
      },
      { client: client as never },
    );

    expect(result.id).toBe("attempt-1");
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into exercise_attempts"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) => call.name === "CommitTransactionCommand"),
    ).toBe(true);
  });
});

describe("revealFollowup", () => {
  test("既存の revealed 一覧に questionId を追記する", async () => {
    const client = new FakeRdsDataClient();
    const result = await revealFollowup(
      CONFIG,
      { attemptId: "attempt-1", questionId: "q-1" },
      { client: client as never },
    );

    expect(result.id).toBe("attempt-1");
    expect(
      client.calls.some((call) =>
        call.sql?.includes("update exercise_attempts set answer_followups"),
      ),
    ).toBe(true);
  });
});

describe("saveDraftAnswers", () => {
  test("in_progress のときだけ回答を更新する", async () => {
    const client = new FakeRdsDataClient();
    const result = await saveDraftAnswers(
      CONFIG,
      {
        answers: {
          additionalConfirmationText: "x",
          assessmentText: "y",
          soapText: "z",
          supportPlanText: "w",
        },
        attemptId: "attempt-1",
      },
      { client: client as never },
    );

    expect(result.id).toBe("attempt-1");
    expect(
      client.calls.some((call) => call.sql?.includes("status = 'in_progress'")),
    ).toBe(true);
  });
});

describe("markAttemptSubmitted", () => {
  test("submitted に更新する", async () => {
    const client = new FakeRdsDataClient();
    const result = await markAttemptSubmitted(
      CONFIG,
      { attemptId: "attempt-1" },
      { client: client as never },
    );
    expect(result.id).toBe("attempt-1");
  });
});

describe("attachFeedback", () => {
  test("フィードバックを作り、feedback_ready に更新する", async () => {
    const client = new FakeRdsDataClient();
    const result = await attachFeedback(
      CONFIG,
      {
        assessmentNote: "a",
        attemptId: "attempt-1",
        dataCollectionNote: "b",
        documentationNote: "c",
        generatedBy: "ai",
        rationaleNote: "d",
        supportPlanNote: "e",
      },
      { client: client as never },
    );

    expect(result.id).toBe("attempt-1");
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into exercise_feedback"),
      ),
    ).toBe(true);
  });
});

describe("listAttemptsForTrainee / listInstructorQueue", () => {
  test("いずれも変換済みの一覧を返す", async () => {
    const client = new FakeRdsDataClient();
    const forTrainee = await listAttemptsForTrainee(
      CONFIG,
      "11111111-1111-1111-1111-111111111111",
      { client: client as never },
    );
    const queue = await listInstructorQueue(CONFIG, {
      client: client as never,
    });

    expect(forTrainee).toEqual([EXPECTED_ATTEMPT]);
    expect(queue).toEqual([EXPECTED_ATTEMPT]);
  });
});
