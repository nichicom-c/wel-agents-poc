import { describe, expect, test } from "bun:test";

import {
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
