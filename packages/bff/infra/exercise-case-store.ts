import {
  type ExerciseCase,
  ExerciseCaseAlreadyExistsError,
  type ExerciseCaseFilters,
  ExerciseCaseMaterialNotFoundError,
  ExerciseCaseMaterialTypeError,
  type ExerciseFollowupQuestion,
  type ExerciseModelAnswer,
  type ModelAnswerType,
} from "../contracts/training.ts";
import {
  beginTransaction,
  commitTransaction,
  execute,
  jsonParam,
  nullableStringParam,
  parseJsonColumn,
  parseRows,
  resolveClient,
  rollbackTransaction,
  stringParam,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
} from "./training-data-sql.ts";

/**
 * 演習ケース（issue #9）の永続化層。issue #10 の `materials`
 * （`material_type: teaching_case`）の1:1拡張である `exercise_cases` を主に、追加質問
 * （`exercise_followup_questions`）・模範回答（`exercise_model_answers`）・評価観点
 * （`exercise_case_rubrics` 経由の、保健師SOAP_KB_詳細設計書_v2 の `rubric`/`rubric_level`）を
 * `json_agg` で1回の select に埋め込んで返す。受講者（trainee）が見る一覧は公開済み
 * （`publication_status: published`）だけに絞る。`createExerciseCase` は既存の
 * `teaching_case` 教材から演習ケースを作る（更新 UI は無い）。
 */

type RawEmbeddedFollowupQuestion = ExerciseFollowupQuestion;
type RawEmbeddedModelAnswer = ExerciseModelAnswer;

type ExerciseCaseRow = {
  id: string;
  title: string;
  specialty_id: string | null;
  learning_theme_id: string | null;
  difficulty_id: string | null;
  initial_presentation: string;
  constraints_text: string | null;
  expected_work_scene: string | null;
  required_institutional_knowledge: string | null;
  evaluation_criteria: string[] | string;
  followup_questions: RawEmbeddedFollowupQuestion[] | string;
  model_answers: RawEmbeddedModelAnswer[] | string;
};

const EXERCISE_CASE_SELECT = `
  select m.id, m.title, m.specialty_id, m.learning_theme_id, m.difficulty_id,
         ec.initial_presentation, ec.constraints_text, ec.expected_work_scene,
         ec.required_institutional_knowledge,
         coalesce((
           select json_agg(
             r.name || '（' || r.objective || '）: ' || coalesce(rl.levels_text, '')
             order by r.sort_order
           )
           from exercise_case_rubrics ecr
           join rubric r on r.id = ecr.rubric_id
           left join lateral (
             select string_agg(
               'レベル' || lv.level || ' ' || lv.level_name || ': ' || lv.definition,
               ' / ' order by lv.level
             ) as levels_text
             from rubric_level lv
             where lv.rubric_id = r.id
           ) rl on true
           where ecr.exercise_case_material_id = ec.material_id
         ), '[]'::json) as evaluation_criteria,
         coalesce((
           select json_agg(json_build_object(
             'id', q.id,
             'questionText', q.question_text,
             'revealedInfoText', q.revealed_info_text
           ) order by q.order_no)
           from exercise_followup_questions q
           where q.exercise_case_material_id = ec.material_id
         ), '[]'::json) as followup_questions,
         coalesce((
           select json_agg(json_build_object(
             'id', a.id,
             'answerType', a.answer_type,
             'content', a.content,
             'acceptableNote', a.acceptable_note
           ))
           from exercise_model_answers a
           where a.exercise_case_material_id = ec.material_id
         ), '[]'::json) as model_answers
  from exercise_cases ec
  join materials m on m.id = ec.material_id
`;

function mapExerciseCaseRow(row: ExerciseCaseRow): ExerciseCase {
  return {
    constraintsText: row.constraints_text ?? undefined,
    difficultyId: row.difficulty_id ?? undefined,
    evaluationCriteria: parseJsonColumn<string[]>(row.evaluation_criteria, []),
    expectedWorkScene: row.expected_work_scene ?? undefined,
    followupQuestions: parseJsonColumn<RawEmbeddedFollowupQuestion[]>(
      row.followup_questions,
      [],
    ),
    id: row.id,
    initialPresentation: parseJsonColumn<string>(row.initial_presentation, ""),
    learningThemeId: row.learning_theme_id ?? undefined,
    modelAnswers: parseJsonColumn<RawEmbeddedModelAnswer[]>(
      row.model_answers,
      [],
    ).map((answer) => ({
      ...answer,
      acceptableNote: answer.acceptableNote ?? undefined,
    })),
    requiredInstitutionalKnowledge:
      row.required_institutional_knowledge ?? undefined,
    specialtyId: row.specialty_id ?? undefined,
    title: row.title,
  };
}

export async function listExerciseCases(
  config: TrainingDataStoreConfig,
  filters: ExerciseCaseFilters = {},
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseCase[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<ExerciseCaseRow>(
    await execute(
      rdsClient,
      config,
      `${EXERCISE_CASE_SELECT}
       where m.publication_status = 'published'::publication_status
         and (:specialtyId::text is null or m.specialty_id = :specialtyId::text)
         and (:difficultyId::text is null or m.difficulty_id = :difficultyId::text)
         and (:learningThemeId::text is null or m.learning_theme_id = :learningThemeId::text)
       order by m.created_at desc`,
      [
        nullableStringParam("specialtyId", filters.specialtyId),
        nullableStringParam("difficultyId", filters.difficultyId),
        nullableStringParam("learningThemeId", filters.learningThemeId),
      ],
    ),
  );
  return rows.map(mapExerciseCaseRow);
}

export async function getExerciseCaseById(
  config: TrainingDataStoreConfig,
  id: string,
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseCase | undefined> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<ExerciseCaseRow>(
    await execute(
      rdsClient,
      config,
      `${EXERCISE_CASE_SELECT} where m.id = :id::uuid`,
      [stringParam("id", id)],
    ),
  );
  const row = rows[0];
  return row ? mapExerciseCaseRow(row) : undefined;
}

export type CreateExerciseCaseFollowupQuestionInput = {
  questionText: string;
  revealedInfoText: string;
};

export type CreateExerciseCaseModelAnswerInput = {
  answerType: ModelAnswerType;
  content: string;
  acceptableNote?: string;
};

export type CreateExerciseCaseInput = {
  /** 演習ケース化する `materials` 行（`material_type: teaching_case` 必須）。 */
  materialId: string;
  initialPresentation: string;
  expectedWorkScene?: string;
  constraintsText?: string;
  requiredInstitutionalKnowledge?: string;
  followupQuestions: CreateExerciseCaseFollowupQuestionInput[];
  modelAnswers: CreateExerciseCaseModelAnswerInput[];
  /** 評価観点として紐づける既存ルーブリックの id（`exercise_case_rubrics`）。 */
  rubricIds: string[];
};

/**
 * 既存の教材（`material_type: teaching_case`）から演習ケースを作る。教材ごとに1件だけ
 * （`exercise_cases.material_id` が主キー）で、追加質問・模範回答・評価観点用ルーブリックを
 * 同じトランザクションで束ねて作る。
 */
export async function createExerciseCase(
  config: TrainingDataStoreConfig,
  input: CreateExerciseCaseInput,
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseCase> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    const materialRows = parseRows<{ material_type: string }>(
      await execute(
        rdsClient,
        config,
        `select material_type from materials where id = :materialId::uuid`,
        [stringParam("materialId", input.materialId)],
        transactionId,
      ),
    );
    const material = materialRows[0];
    if (!material) {
      throw new ExerciseCaseMaterialNotFoundError(
        `material not found: ${input.materialId}`,
      );
    }
    if (material.material_type !== "teaching_case") {
      throw new ExerciseCaseMaterialTypeError(
        `material_type must be teaching_case: ${input.materialId}`,
      );
    }

    const existingRows = parseRows<{ material_id: string }>(
      await execute(
        rdsClient,
        config,
        `select material_id from exercise_cases where material_id = :materialId::uuid`,
        [stringParam("materialId", input.materialId)],
        transactionId,
      ),
    );
    if (existingRows[0]) {
      throw new ExerciseCaseAlreadyExistsError(
        `exercise case already exists for material: ${input.materialId}`,
      );
    }

    await execute(
      rdsClient,
      config,
      `insert into exercise_cases
         (material_id, initial_presentation, constraints_text, expected_work_scene,
          required_institutional_knowledge)
       values
         (:materialId::uuid, :initialPresentation, :constraintsText, :expectedWorkScene,
          :requiredInstitutionalKnowledge)`,
      [
        stringParam("materialId", input.materialId),
        jsonParam("initialPresentation", input.initialPresentation),
        nullableStringParam("constraintsText", input.constraintsText),
        nullableStringParam("expectedWorkScene", input.expectedWorkScene),
        nullableStringParam(
          "requiredInstitutionalKnowledge",
          input.requiredInstitutionalKnowledge,
        ),
      ],
      transactionId,
    );

    for (const [index, question] of input.followupQuestions.entries()) {
      await execute(
        rdsClient,
        config,
        `insert into exercise_followup_questions
           (exercise_case_material_id, question_text, revealed_info_text, order_no)
         values
           (:materialId::uuid, :questionText, :revealedInfoText, :orderNo)`,
        [
          stringParam("materialId", input.materialId),
          stringParam("questionText", question.questionText),
          stringParam("revealedInfoText", question.revealedInfoText),
          { name: "orderNo", value: { longValue: index + 1 } },
        ],
        transactionId,
      );
    }

    for (const answer of input.modelAnswers) {
      await execute(
        rdsClient,
        config,
        `insert into exercise_model_answers
           (exercise_case_material_id, answer_type, content, acceptable_note)
         values
           (:materialId::uuid, :answerType::model_answer_type, :content, :acceptableNote)`,
        [
          stringParam("materialId", input.materialId),
          stringParam("answerType", answer.answerType),
          jsonParam("content", answer.content),
          nullableStringParam("acceptableNote", answer.acceptableNote),
        ],
        transactionId,
      );
    }

    for (const rubricId of input.rubricIds) {
      await execute(
        rdsClient,
        config,
        `insert into exercise_case_rubrics (exercise_case_material_id, rubric_id)
         values (:materialId::uuid, :rubricId::uuid)`,
        [
          stringParam("materialId", input.materialId),
          stringParam("rubricId", rubricId),
        ],
        transactionId,
      );
    }

    const createdRows = parseRows<ExerciseCaseRow>(
      await execute(
        rdsClient,
        config,
        `${EXERCISE_CASE_SELECT} where m.id = :materialId::uuid`,
        [stringParam("materialId", input.materialId)],
        transactionId,
      ),
    );
    const createdRow = createdRows[0];
    if (!createdRow) {
      throw new Error(
        `failed to load created exercise case: ${input.materialId}`,
      );
    }

    await commitTransaction(rdsClient, config, transactionId);

    return mapExerciseCaseRow(createdRow);
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}
