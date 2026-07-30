import type {
  ExerciseCase,
  ExerciseCaseFilters,
  ExerciseFollowupQuestion,
  ExerciseModelAnswer,
} from "../contracts/training.ts";
import {
  execute,
  nullableStringParam,
  parseJsonColumn,
  parseRows,
  resolveClient,
  stringParam,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
} from "./training-data-sql.ts";

/**
 * 演習ケース（issue #9）の読み取り専用永続化層。issue #10 の `materials`
 * （`material_type: teaching_case`）の1:1拡張である `exercise_cases` を主に、追加質問
 * （`exercise_followup_questions`）・模範回答（`exercise_model_answers`）・評価観点
 * （`exercise_case_rubrics` 経由の `rubric_items.criterion_name`）を `json_agg` で1回の
 * select に埋め込んで返す。作成/更新 UI はまだ無い（教材候補からの教材化と同様、issue #10 の
 * Admin から `materials` 行を作るところまでしか実装が無い）ため read のみ提供する。
 * 受講者（trainee）が見る一覧は公開済み（`publication_status: published`）だけに絞る。
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
           select json_agg(ri.criterion_name order by ri.order_no)
           from exercise_case_rubrics ecr
           join rubric_items ri on ri.rubric_id = ecr.rubric_id
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
