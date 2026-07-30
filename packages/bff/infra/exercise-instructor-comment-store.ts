import type { ExerciseAttempt } from "../contracts/training.ts";
import { getAttemptById } from "./exercise-attempt-store.ts";
import {
  beginTransaction,
  commitTransaction,
  execute,
  parseRows,
  resolveClient,
  rollbackTransaction,
  stringParam,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
  upsertAppUser,
} from "./training-data-sql.ts";

/**
 * 指導者コメント（issue #9）の永続化層。`exercise_instructor_comments` への insert のみを
 * 担う（read は `exercise-attempt-store.ts` が `feedback.instructorComments` として埋め込む）。
 */

export type PostInstructorCommentInput = {
  feedbackId: string;
  instructorId: string;
  instructorDisplayName?: string;
  body: string;
};

/** コメントを追加し、紐づく演習の受講記録（コメント一覧を含む）を返す。 */
export async function postInstructorComment(
  config: TrainingDataStoreConfig,
  input: PostInstructorCommentInput,
  deps: TrainingDataStoreDeps = {},
): Promise<ExerciseAttempt> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  let attemptId: string;
  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.instructorDisplayName, id: input.instructorId },
      transactionId,
    );

    const rows = parseRows<{ attempt_id: string }>(
      await execute(
        rdsClient,
        config,
        `select attempt_id from exercise_feedback where id = :feedbackId::uuid`,
        [stringParam("feedbackId", input.feedbackId)],
        transactionId,
      ),
    );
    const row = rows[0];
    if (!row) {
      throw new Error(`exercise feedback not found: ${input.feedbackId}`);
    }
    attemptId = row.attempt_id;

    await execute(
      rdsClient,
      config,
      `insert into exercise_instructor_comments (feedback_id, instructor_id, body)
       values (:feedbackId::uuid, :instructorId::uuid, :body)`,
      [
        stringParam("feedbackId", input.feedbackId),
        stringParam("instructorId", input.instructorId),
        stringParam("body", input.body),
      ],
      transactionId,
    );

    await commitTransaction(rdsClient, config, transactionId);
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }

  return getAttemptById(config, attemptId, deps);
}
