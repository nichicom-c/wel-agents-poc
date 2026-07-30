import type {
  CommentType,
  ProfessionalComment,
} from "../contracts/professional-comments.ts";
import type { SoapCategory } from "../contracts/soap-records.ts";
import {
  beginTransaction,
  commitTransaction,
  execute,
  nullableStringParam,
  parseRows,
  resolveClient,
  rollbackTransaction,
  stringParam,
  type TrainingDataStoreConfig,
  type TrainingDataStoreDeps,
  upsertAppUser,
} from "./training-data-sql.ts";

/**
 * 専門職コメント（issue #8）の永続化層。`soap-record-store.ts` と同じ規約（SQL を直接組み立て、
 * enum は明示 `::型名` キャスト）で `professional_comments` を読み書きする。
 */

export type CreateProfessionalCommentInput = {
  targetRecordId: string;
  targetRecordVersionId: string;
  soapCategory?: SoapCategory;
  commentType: CommentType;
  body: string;
  /** JWT `sub`（uuid 形式）。`app_users.id` の upsert にも使う。 */
  authorId: string;
  authorDisplayName?: string;
  authorRoleAtPost: string;
};

export async function createProfessionalComment(
  config: TrainingDataStoreConfig,
  input: CreateProfessionalCommentInput,
  deps: TrainingDataStoreDeps = {},
): Promise<ProfessionalComment> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.authorDisplayName, id: input.authorId },
      transactionId,
    );

    const rows = parseRows<{ id: string; created_at: string }>(
      await execute(
        rdsClient,
        config,
        `insert into professional_comments
           (target_record_id, target_record_version_id, soap_category, comment_type, body,
            author_id, author_role_at_post)
         values
           (:targetRecordId::uuid, :targetRecordVersionId::uuid, :soapCategory::soap_category,
            :commentType::comment_type, :body, :authorId::uuid, :authorRoleAtPost)
         returning id, created_at`,
        [
          stringParam("targetRecordId", input.targetRecordId),
          stringParam("targetRecordVersionId", input.targetRecordVersionId),
          nullableStringParam("soapCategory", input.soapCategory),
          stringParam("commentType", input.commentType),
          stringParam("body", input.body),
          stringParam("authorId", input.authorId),
          stringParam("authorRoleAtPost", input.authorRoleAtPost),
        ],
        transactionId,
      ),
    );
    const row = rows[0];
    if (!row) {
      throw new Error("failed to create professional_comment");
    }

    await commitTransaction(rdsClient, config, transactionId);

    return {
      authorId: input.authorId,
      authorName: input.authorDisplayName || input.authorRoleAtPost,
      authorRoleAtPost: input.authorRoleAtPost,
      body: input.body,
      commentType: input.commentType,
      createdAt: row.created_at,
      id: row.id,
      soapCategory: input.soapCategory,
      targetRecordId: input.targetRecordId,
      targetRecordVersionId: input.targetRecordVersionId,
    };
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}

export async function listCommentsForVersion(
  config: TrainingDataStoreConfig,
  input: { targetRecordVersionId: string },
  deps: TrainingDataStoreDeps = {},
): Promise<ProfessionalComment[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<{
    id: string;
    target_record_id: string;
    target_record_version_id: string;
    soap_category: SoapCategory | null;
    comment_type: CommentType;
    body: string;
    author_id: string;
    author_name: string;
    author_role_at_post: string;
    created_at: string;
  }>(
    await execute(
      rdsClient,
      config,
      `select pc.id, pc.target_record_id, pc.target_record_version_id, pc.soap_category,
              pc.comment_type, pc.body, pc.author_id,
              coalesce(au.display_name, pc.author_role_at_post) as author_name,
              pc.author_role_at_post, pc.created_at
       from professional_comments pc
       left join app_users au on au.id = pc.author_id
       where pc.target_record_version_id = :targetRecordVersionId::uuid
       order by pc.created_at asc`,
      [stringParam("targetRecordVersionId", input.targetRecordVersionId)],
    ),
  );
  return rows.map((row) => ({
    authorId: row.author_id,
    authorName: row.author_name,
    authorRoleAtPost: row.author_role_at_post,
    body: row.body,
    commentType: row.comment_type,
    createdAt: row.created_at,
    id: row.id,
    soapCategory: row.soap_category ?? undefined,
    targetRecordId: row.target_record_id,
    targetRecordVersionId: row.target_record_version_id,
  }));
}
