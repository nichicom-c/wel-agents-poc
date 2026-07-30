import { describe, expect, test } from "bun:test";

import { postInstructorComment } from "./exercise-instructor-comment-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

const ATTEMPT_ROW = {
  answer_assessment: "",
  answer_followups: "[]",
  answer_soap: "{}",
  answer_support_plan: "",
  exercise_case: JSON.stringify({
    evaluationCriteria: [],
    followupQuestions: [],
    id: "case-1",
    initialPresentation: "presentation",
    modelAnswers: [],
    title: "title",
  }),
  feedback: JSON.stringify({
    assessmentNote: "a",
    attemptId: "attempt-1",
    createdAt: "2026-07-20T09:00:00.000Z",
    dataCollectionNote: "b",
    documentationNote: "c",
    generatedBy: "ai",
    id: "feedback-1",
    instructorComments: JSON.stringify([
      {
        body: "良い視点です。",
        createdAt: "2026-07-21T09:00:00.000Z",
        id: "comment-1",
        instructorId: "22222222-2222-2222-2222-222222222222",
        instructorName: "鈴木 instructor",
      },
    ]),
    rationaleNote: "d",
    supportPlanNote: "e",
  }),
  id: "attempt-1",
  started_at: "2026-07-20T09:00:00.000Z",
  status: "feedback_ready",
  submitted_at: "2026-07-20T09:10:00.000Z",
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
    if (sql.includes("select attempt_id from exercise_feedback")) {
      return {
        formattedRecords: JSON.stringify([{ attempt_id: "attempt-1" }]),
      };
    }
    if (sql.includes("insert into exercise_instructor_comments")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("where ea.id = :id")) {
      return { formattedRecords: JSON.stringify([ATTEMPT_ROW]) };
    }

    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("postInstructorComment", () => {
  test("コメントを追加し、埋め込みコメント一覧を含む受講記録を返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await postInstructorComment(
      CONFIG,
      {
        body: "良い視点です。",
        feedbackId: "feedback-1",
        instructorId: "22222222-2222-2222-2222-222222222222",
      },
      { client: client as never },
    );

    expect(result.id).toBe("attempt-1");
    expect(result.feedback?.instructorComments).toEqual([
      {
        body: "良い視点です。",
        createdAt: "2026-07-21T09:00:00.000Z",
        id: "comment-1",
        instructorId: "22222222-2222-2222-2222-222222222222",
        instructorName: "鈴木 instructor",
      },
    ]);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into exercise_instructor_comments"),
      ),
    ).toBe(true);
  });

  test("feedbackId が存在しなければ例外を投げる", async () => {
    class NotFoundClient extends FakeRdsDataClient {
      override async send(command: {
        constructor: { name: string };
        input?: Record<string, unknown>;
      }): Promise<unknown> {
        const sql =
          typeof command.input?.sql === "string"
            ? command.input.sql
            : undefined;
        if (sql?.includes("select attempt_id from exercise_feedback")) {
          return { formattedRecords: "[]" };
        }
        return super.send(command);
      }
    }
    const client = new NotFoundClient();

    await expect(
      postInstructorComment(
        CONFIG,
        {
          body: "x",
          feedbackId: "missing",
          instructorId: "22222222-2222-2222-2222-222222222222",
        },
        { client: client as never },
      ),
    ).rejects.toThrow("exercise feedback not found");
  });
});
