import type {
  ExerciseAttempt,
  ExerciseAttemptAnswers,
  ExerciseAttemptStatus,
  ExerciseCase,
  ExerciseFeedback,
  ExerciseFeedbackGeneratedBy,
} from "../contracts/training.ts";
import {
  beginTransaction,
  commitTransaction,
  execute,
  jsonParam,
  parseJsonColumn,
  parseRows,
  resolveClient,
  rollbackTransaction,
  stringParam,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
  upsertAppUser,
} from "./training-data-sql.ts";

/**
 * 演習の受講記録（issue #9）の永続化層。`exercise_attempts` を主に、演習ケース
 * （`exercise_cases` 以下。`exercise-case-store.ts` と同じ embed 方針）とフィードバック
 * （`exercise_feedback` + `exercise_instructor_comments`）を `json_build_object`/`json_agg` で
 * 1回の select に埋め込んで返す。フィードバック本体（AI 生成分）は
 * `packages/agentcore` の演習フィードバック agent が生成し、この store はその結果を
 * 保存・埋め込むだけ（生成そのものは呼び出し元の application 層が担う）。
 */

const EXERCISE_CASE_JSON_FRAGMENT = `(
  select json_build_object(
    'id', s.id,
    'title', s.title,
    'specialtyId', s.specialty_id,
    'learningThemeId', s.learning_theme_id,
    'difficultyId', s.difficulty_id,
    'initialPresentation', s.initial_presentation,
    'expectedWorkScene', s.expected_work_scene,
    'constraintsText', s.constraints_text,
    'requiredInstitutionalKnowledge', s.required_institutional_knowledge,
    'evaluationCriteria', s.evaluation_criteria,
    'followupQuestions', s.followup_questions,
    'modelAnswers', s.model_answers
  )
  from (
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
               'id', q.id, 'questionText', q.question_text, 'revealedInfoText', q.revealed_info_text
             ) order by q.order_no)
             from exercise_followup_questions q
             where q.exercise_case_material_id = ec.material_id
           ), '[]'::json) as followup_questions,
           coalesce((
             select json_agg(json_build_object(
               'id', a.id, 'answerType', a.answer_type, 'content', a.content,
               'acceptableNote', a.acceptable_note
             ))
             from exercise_model_answers a
             where a.exercise_case_material_id = ec.material_id
           ), '[]'::json) as model_answers
    from exercise_cases ec
    join materials m on m.id = ec.material_id
    where m.id = ea.exercise_case_material_id
  ) s
)`;

const EXERCISE_FEEDBACK_JSON_FRAGMENT = `(
  select json_build_object(
    'id', ef.id,
    'attemptId', ef.attempt_id,
    'generatedBy', ef.generated_by,
    'dataCollectionNote', ef.data_collection_note,
    'rationaleNote', ef.rationale_note,
    'assessmentNote', ef.assessment_note,
    'supportPlanNote', ef.support_plan_note,
    'documentationNote', ef.documentation_note,
    'createdAt', ef.created_at,
    'instructorComments', coalesce((
      select json_agg(json_build_object(
        'id', ic.id,
        'instructorId', ic.instructor_id,
        'instructorName', coalesce(iau.display_name, 'instructor'),
        'body', ic.body,
        'createdAt', ic.created_at
      ) order by ic.created_at)
      from exercise_instructor_comments ic
      left join app_users iau on iau.id = ic.instructor_id
      where ic.feedback_id = ef.id
    ), '[]'::json)
  )
  from exercise_feedback ef
  where ef.attempt_id = ea.id
  order by ef.created_at desc
  limit 1
)`;

const ATTEMPT_SELECT = `
  select ea.id, ea.trainee_id, ea.status, ea.answer_soap, ea.answer_assessment,
         ea.answer_support_plan, ea.answer_followups, ea.started_at, ea.submitted_at,
         coalesce(au.display_name, 'trainee') as trainee_name,
         ${EXERCISE_CASE_JSON_FRAGMENT} as exercise_case,
         ${EXERCISE_FEEDBACK_JSON_FRAGMENT} as feedback
  from exercise_attempts ea
  left join app_users au on au.id = ea.trainee_id
`;

type RawAnswerSoap = { soapText?: string; additionalConfirmationText?: string };

type AttemptRow = {
  id: string;
  trainee_id: string;
  trainee_name: string;
  status: ExerciseAttemptStatus;
  answer_soap: RawAnswerSoap | string | null;
  answer_assessment: string | null;
  answer_support_plan: string | null;
  answer_followups: string[] | string | null;
  started_at: string;
  submitted_at: string | null;
  exercise_case: ExerciseCase | string;
  feedback:
    | (ExerciseFeedback & { instructorComments: unknown })
    | string
    | null;
};

function mapAttemptRow(row: AttemptRow): ExerciseAttempt {
  const answerSoap = parseJsonColumn<RawAnswerSoap>(
    row.answer_soap ?? "{}",
    {},
  );
  const exerciseCase = parseJsonColumn<ExerciseCase>(
    row.exercise_case,
    emptyExerciseCase(),
  );
  const rawFeedback = row.feedback
    ? parseJsonColumn<
        (ExerciseFeedback & { instructorComments: unknown }) | null
      >(row.feedback, null)
    : null;

  return {
    answers: {
      additionalConfirmationText: answerSoap.additionalConfirmationText ?? "",
      assessmentText: row.answer_assessment ?? "",
      soapText: answerSoap.soapText ?? "",
      supportPlanText: row.answer_support_plan ?? "",
    },
    exerciseCase,
    feedback: rawFeedback
      ? {
          ...rawFeedback,
          instructorComments: parseJsonColumn(
            rawFeedback.instructorComments,
            [],
          ),
        }
      : undefined,
    id: row.id,
    revealedFollowupQuestionIds: parseJsonColumn<string[]>(
      row.answer_followups ?? "[]",
      [],
    ),
    startedAt: row.started_at,
    status: row.status,
    submittedAt: row.submitted_at ?? undefined,
    traineeId: row.trainee_id,
    traineeName: row.trainee_name,
  };
}

function emptyExerciseCase(): ExerciseCase {
  return {
    evaluationCriteria: [],
    followupQuestions: [],
    id: "",
    initialPresentation: "",
    modelAnswers: [],
    title: "",
  };
}

async function fetchAttemptById(
  config: TrainingDataStoreConfig,
  id: string,
  deps: TrainingDataStoreDeps,
): Promise<ExerciseAttempt> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<AttemptRow>(
    await execute(
      rdsClient,
      config,
      `${ATTEMPT_SELECT} where ea.id = :id::uuid`,
      [stringParam("id", id)],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`exercise attempt not found: ${id}`);
  }
  return mapAttemptRow(row);
}

export async function getAttemptById(
  config: TrainingDataStoreConfig,
  id: string,
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt> {
  return fetchAttemptById(config, id, deps);
}

export type StartAttemptInput = {
  exerciseCaseId: string;
  traineeId: string;
  traineeDisplayName?: string;
};

export async function startAttempt(
  config: TrainingDataStoreConfig,
  input: StartAttemptInput,
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.traineeDisplayName, id: input.traineeId },
      transactionId,
    );

    const rows = parseRows<{ id: string }>(
      await execute(
        rdsClient,
        config,
        `insert into exercise_attempts
           (exercise_case_material_id, trainee_id, status, answer_soap, answer_followups)
         values
           (:exerciseCaseId::uuid, :traineeId::uuid, 'in_progress'::exercise_attempt_status,
            :answerSoap, :answerFollowups)
         returning id`,
        [
          stringParam("exerciseCaseId", input.exerciseCaseId),
          stringParam("traineeId", input.traineeId),
          jsonParam("answerSoap", {
            additionalConfirmationText: "",
            soapText: "",
          }),
          jsonParam("answerFollowups", []),
        ],
        transactionId,
      ),
    );
    const row = rows[0];
    if (!row) {
      throw new Error("failed to start exercise attempt");
    }

    await commitTransaction(rdsClient, config, transactionId);

    return fetchAttemptById(config, row.id, deps);
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}

export async function revealFollowup(
  config: TrainingDataStoreConfig,
  input: { attemptId: string; questionId: string },
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<{ answer_followups: string[] | string | null }>(
    await execute(
      rdsClient,
      config,
      `select answer_followups from exercise_attempts where id = :id::uuid`,
      [stringParam("id", input.attemptId)],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`exercise attempt not found: ${input.attemptId}`);
  }
  const revealed = parseJsonColumn<string[]>(row.answer_followups ?? "[]", []);
  const nextRevealed = revealed.includes(input.questionId)
    ? revealed
    : [...revealed, input.questionId];

  await execute(
    rdsClient,
    config,
    `update exercise_attempts set answer_followups = :answerFollowups where id = :id::uuid`,
    [
      stringParam("id", input.attemptId),
      jsonParam("answerFollowups", nextRevealed),
    ],
  );
  return fetchAttemptById(config, input.attemptId, deps);
}

export async function saveDraftAnswers(
  config: TrainingDataStoreConfig,
  input: { attemptId: string; answers: ExerciseAttemptAnswers },
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt> {
  const rdsClient = resolveClient(config, deps);
  await execute(
    rdsClient,
    config,
    `update exercise_attempts
     set answer_soap = :answerSoap, answer_assessment = :assessmentText,
         answer_support_plan = :supportPlanText
     where id = :id::uuid and status = 'in_progress'::exercise_attempt_status`,
    [
      stringParam("id", input.attemptId),
      jsonParam("answerSoap", {
        additionalConfirmationText: input.answers.additionalConfirmationText,
        soapText: input.answers.soapText,
      }),
      stringParam("assessmentText", input.answers.assessmentText),
      stringParam("supportPlanText", input.answers.supportPlanText),
    ],
  );
  return fetchAttemptById(config, input.attemptId, deps);
}

/** 提出済みに更新する。すでに `in_progress` でなければ更新しない（多重提出防止）。 */
export async function markAttemptSubmitted(
  config: TrainingDataStoreConfig,
  input: { attemptId: string },
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt> {
  const rdsClient = resolveClient(config, deps);
  await execute(
    rdsClient,
    config,
    `update exercise_attempts
     set status = 'submitted'::exercise_attempt_status, submitted_at = now()
     where id = :id::uuid and status = 'in_progress'::exercise_attempt_status`,
    [stringParam("id", input.attemptId)],
  );
  return fetchAttemptById(config, input.attemptId, deps);
}

export type AttachFeedbackInput = {
  attemptId: string;
  generatedBy: ExerciseFeedbackGeneratedBy;
  dataCollectionNote: string;
  rationaleNote: string;
  assessmentNote: string;
  supportPlanNote: string;
  documentationNote: string;
};

/** 演習フィードバック（AI 生成分）を保存し、`feedback_ready` に更新する。 */
export async function attachFeedback(
  config: TrainingDataStoreConfig,
  input: AttachFeedbackInput,
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt> {
  const rdsClient = resolveClient(config, deps);
  await execute(
    rdsClient,
    config,
    `insert into exercise_feedback
       (attempt_id, generated_by, data_collection_note, rationale_note, assessment_note,
        support_plan_note, documentation_note)
     values
       (:attemptId::uuid, :generatedBy::feedback_generated_by, :dataCollectionNote,
        :rationaleNote, :assessmentNote, :supportPlanNote, :documentationNote)`,
    [
      stringParam("attemptId", input.attemptId),
      stringParam("generatedBy", input.generatedBy),
      stringParam("dataCollectionNote", input.dataCollectionNote),
      stringParam("rationaleNote", input.rationaleNote),
      stringParam("assessmentNote", input.assessmentNote),
      stringParam("supportPlanNote", input.supportPlanNote),
      stringParam("documentationNote", input.documentationNote),
    ],
  );
  await execute(
    rdsClient,
    config,
    `update exercise_attempts
     set status = 'feedback_ready'::exercise_attempt_status
     where id = :id::uuid`,
    [stringParam("id", input.attemptId)],
  );
  return fetchAttemptById(config, input.attemptId, deps);
}

export async function listAttemptsForTrainee(
  config: TrainingDataStoreConfig,
  traineeId: string,
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<AttemptRow>(
    await execute(
      rdsClient,
      config,
      `${ATTEMPT_SELECT} where ea.trainee_id = :traineeId::uuid order by ea.started_at desc`,
      [stringParam("traineeId", traineeId)],
    ),
  );
  return rows.map(mapAttemptRow);
}

export async function listInstructorQueue(
  config: TrainingDataStoreConfig,
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<AttemptRow>(
    await execute(
      rdsClient,
      config,
      `${ATTEMPT_SELECT}
       where ea.status in ('submitted'::exercise_attempt_status, 'feedback_ready'::exercise_attempt_status)
       order by ea.submitted_at desc`,
    ),
  );
  return rows.map(mapAttemptRow);
}
