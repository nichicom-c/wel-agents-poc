import { describe, expect, test } from "bun:test";

import {
  ExerciseCaseAlreadyExistsError,
  ExerciseCaseMaterialNotFoundError,
  ExerciseCaseMaterialTypeError,
} from "../contracts/training.ts";
import {
  createExerciseCase,
  getExerciseCaseById,
  listExerciseCases,
} from "./exercise-case-store.ts";

const CONFIG = {
  clusterArn: "arn:aws:rds:ap-northeast-1:123456789012:cluster:training-data",
  database: "training_data",
  region: "ap-northeast-1",
  secretArn:
    "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:rds!cluster-x",
};

const CASE_ROW = {
  constraints_text: "訪問時間は30分。",
  difficulty_id: "intermediate",
  evaluation_criteria: JSON.stringify(["S/O が A を支えているか。"]),
  expected_work_scene: "産後2ヶ月の母子訪問",
  followup_questions: JSON.stringify([
    {
      id: "q-1",
      questionText: "パートナーの育児参加状況を確認する",
      revealedInfoText: "育児参加は限定的。",
    },
  ]),
  id: "case-1",
  initial_presentation: JSON.stringify("母親から夜間の授乳がつらいと発言。"),
  learning_theme_id: "assessment-basics",
  model_answers: JSON.stringify([
    {
      acceptableNote: null,
      answerType: "soap",
      content: "S: 夜間の授乳がつらい。",
      id: "answer-1",
    },
  ]),
  required_institutional_knowledge: "産後ケア事業の利用要件",
  specialty_id: "maternal-child",
  title: "母子訪問での疲労蓄積アセスメント演習",
};

class FakeRdsDataClient {
  async send(command: {
    constructor: { name: string };
    input?: Record<string, unknown>;
  }): Promise<unknown> {
    const sql =
      typeof command.input?.sql === "string" ? command.input.sql : undefined;
    if (sql?.includes("where m.id = :id")) {
      return { formattedRecords: JSON.stringify([CASE_ROW]) };
    }
    if (sql?.includes("where m.publication_status")) {
      return { formattedRecords: JSON.stringify([CASE_ROW]) };
    }
    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

const EXPECTED = {
  constraintsText: "訪問時間は30分。",
  difficultyId: "intermediate",
  evaluationCriteria: ["S/O が A を支えているか。"],
  expectedWorkScene: "産後2ヶ月の母子訪問",
  followupQuestions: [
    {
      id: "q-1",
      questionText: "パートナーの育児参加状況を確認する",
      revealedInfoText: "育児参加は限定的。",
    },
  ],
  id: "case-1",
  initialPresentation: "母親から夜間の授乳がつらいと発言。",
  learningThemeId: "assessment-basics",
  modelAnswers: [
    {
      acceptableNote: undefined,
      answerType: "soap" as const,
      content: "S: 夜間の授乳がつらい。",
      id: "answer-1",
    },
  ],
  requiredInstitutionalKnowledge: "産後ケア事業の利用要件",
  specialtyId: "maternal-child",
  title: "母子訪問での疲労蓄積アセスメント演習",
};

describe("listExerciseCases", () => {
  test("埋め込み JSON を JSON 文字列から camelCase の配列/文字列に変換する", async () => {
    const client = new FakeRdsDataClient();
    const result = await listExerciseCases(CONFIG, undefined, {
      client: client as never,
    });

    expect(result).toEqual([EXPECTED]);
  });
});

describe("getExerciseCaseById", () => {
  test("見つかれば変換済みのケースを返す", async () => {
    const client = new FakeRdsDataClient();
    const result = await getExerciseCaseById(CONFIG, "case-1", {
      client: client as never,
    });

    expect(result).toEqual(EXPECTED);
  });

  test("見つからなければ undefined を返す", async () => {
    class EmptyClient extends FakeRdsDataClient {
      override async send(): Promise<unknown> {
        return { formattedRecords: "[]" };
      }
    }
    const result = await getExerciseCaseById(CONFIG, "missing", {
      client: new EmptyClient() as never,
    });

    expect(result).toBeUndefined();
  });
});

type RecordedCall = { name: string; sql?: string };

class FakeCreateExerciseCaseClient {
  readonly calls: RecordedCall[] = [];
  private txCounter = 0;
  materialTypeRows: { material_type: string }[] = [
    { material_type: "teaching_case" },
  ];
  existingRows: { material_id: string }[] = [];

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

    if (sql.includes("select material_type from materials")) {
      return { formattedRecords: JSON.stringify(this.materialTypeRows) };
    }
    if (sql.includes("select material_id from exercise_cases")) {
      return { formattedRecords: JSON.stringify(this.existingRows) };
    }
    if (sql.includes("insert into exercise_cases")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("insert into exercise_followup_questions")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("insert into exercise_model_answers")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("insert into exercise_case_rubrics")) {
      return { formattedRecords: "[]" };
    }
    if (sql.includes("where m.id = :materialId")) {
      return { formattedRecords: JSON.stringify([CASE_ROW]) };
    }
    throw new Error(`unhandled sql in fake client: ${sql}`);
  }
}

describe("createExerciseCase", () => {
  const INPUT = {
    constraintsText: "訪問時間は30分。",
    expectedWorkScene: "産後2ヶ月の母子訪問",
    followupQuestions: [{ questionText: "q1", revealedInfoText: "info1" }],
    initialPresentation: "母親から夜間の授乳がつらいと発言。",
    materialId: "material-1",
    modelAnswers: [
      { answerType: "soap" as const, content: "S: 夜間の授乳がつらい。" },
    ],
    requiredInstitutionalKnowledge: "産後ケア事業の利用要件",
    rubricIds: ["rubric-1"],
  };

  test("教材から演習ケースを作り、埋め込み済みの結果を返す", async () => {
    const client = new FakeCreateExerciseCaseClient();
    const result = await createExerciseCase(CONFIG, INPUT, {
      client: client as never,
    });

    expect(result).toEqual(EXPECTED);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into exercise_cases"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into exercise_followup_questions"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into exercise_model_answers"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) =>
        call.sql?.includes("insert into exercise_case_rubrics"),
      ),
    ).toBe(true);
    expect(
      client.calls.some((call) => call.name === "CommitTransactionCommand"),
    ).toBe(true);
  });

  test("教材が存在しなければ ExerciseCaseMaterialNotFoundError を投げ、rollback する", async () => {
    const client = new FakeCreateExerciseCaseClient();
    client.materialTypeRows = [];

    await expect(
      createExerciseCase(CONFIG, INPUT, { client: client as never }),
    ).rejects.toThrow(ExerciseCaseMaterialNotFoundError);
    expect(
      client.calls.some((call) => call.name === "RollbackTransactionCommand"),
    ).toBe(true);
  });

  test("material_type が teaching_case でなければ ExerciseCaseMaterialTypeError を投げる", async () => {
    const client = new FakeCreateExerciseCaseClient();
    client.materialTypeRows = [{ material_type: "comment_derived_note" }];

    await expect(
      createExerciseCase(CONFIG, INPUT, { client: client as never }),
    ).rejects.toThrow(ExerciseCaseMaterialTypeError);
  });

  test("すでに演習ケースが存在すれば ExerciseCaseAlreadyExistsError を投げる", async () => {
    const client = new FakeCreateExerciseCaseClient();
    client.existingRows = [{ material_id: "material-1" }];

    await expect(
      createExerciseCase(CONFIG, INPUT, { client: client as never }),
    ).rejects.toThrow(ExerciseCaseAlreadyExistsError);
  });
});
