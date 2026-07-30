import type { RDSDataClient } from "@aws-sdk/client-rds-data";

import {
  type MaterialCandidate,
  MaterialCandidateAlreadyPromotedError,
  type MaterialCandidateFilters,
  MaterialCandidateNotApprovedError,
  type MaterialCandidateStatus,
  type MaterialCandidateStatusEvent,
} from "../contracts/material-candidates.ts";
import type { ProfessionalComment } from "../contracts/professional-comments.ts";
import type { SoapRecordType } from "../contracts/soap-records.ts";
import {
  beginTransaction,
  commitTransaction,
  execute,
  nullableStringParam,
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
 * 教材候補（issue #8）の永続化層。`material_candidates` を主に、紐づく専門職コメント
 * （`material_candidate_comments` 経由）と状態履歴（`material_candidate_status_events`）を
 * `json_agg` で1回の select に埋め込んで返す（Knowledge Review の「詳細」展開が追加 fetch
 * 無しで表示できるようにするため）。埋め込み JSON は `json_build_object` で camelCase の
 * key を直接組み立てるため、トップレベルの列（snake_case）だけを個別に変換すればよい。
 */

type RawEmbeddedComment = Omit<ProfessionalComment, "soapCategory"> & {
  soapCategory: ProfessionalComment["soapCategory"] | null;
};

type RawEmbeddedStatusEvent = Omit<
  MaterialCandidateStatusEvent,
  "reasonText"
> & {
  reasonText: string | null;
};

type CandidateRow = {
  id: string;
  title: string;
  summary: string;
  status: MaterialCandidateStatus;
  specialty_id: string | null;
  record_type: SoapRecordType | null;
  learning_theme_id: string | null;
  difficulty_id: string | null;
  rejection_reason_code: string | null;
  material_id: string | null;
  created_by: string;
  created_at: string;
  comments: RawEmbeddedComment[] | string;
  status_history: RawEmbeddedStatusEvent[] | string;
};

const CANDIDATE_SELECT = `
  select mc.id, mc.title, mc.summary, mc.status, mc.specialty_id, mc.record_type,
         mc.learning_theme_id, mc.difficulty_id, mc.rejection_reason_code, mc.material_id,
         mc.created_by, mc.created_at,
         coalesce((
           select json_agg(json_build_object(
             'id', pc.id,
             'targetRecordId', pc.target_record_id,
             'targetRecordVersionId', pc.target_record_version_id,
             'soapCategory', pc.soap_category,
             'commentType', pc.comment_type,
             'body', pc.body,
             'authorId', pc.author_id,
             'authorName', coalesce(au.display_name, pc.author_role_at_post),
             'authorRoleAtPost', pc.author_role_at_post,
             'createdAt', pc.created_at
           ) order by pc.created_at)
           from material_candidate_comments mcc
           join professional_comments pc on pc.id = mcc.comment_id
           left join app_users au on au.id = pc.author_id
           where mcc.material_candidate_id = mc.id
         ), '[]'::json) as comments,
         coalesce((
           select json_agg(json_build_object(
             'fromStatus', e.from_status,
             'toStatus', e.to_status,
             'changedBy', e.changed_by,
             'changedByRole', e.changed_by_role,
             'reasonText', e.reason_text,
             'changedAt', e.changed_at
           ) order by e.changed_at)
           from material_candidate_status_events e
           where e.material_candidate_id = mc.id
         ), '[]'::json) as status_history
  from material_candidates mc
`;

/**
 * `json_build_object` は欠けている key も `null` で埋めるため、`?: T` な optional field は
 * ここで `undefined` に変換する（`fromStatus` は null 自体が「直前の状態が無い」という正しい
 * 値なので変換しない）。
 */
function mapCandidateRow(row: CandidateRow): MaterialCandidate {
  const comments = parseJsonColumn<RawEmbeddedComment[]>(row.comments, []);
  const statusHistory = parseJsonColumn<RawEmbeddedStatusEvent[]>(
    row.status_history,
    [],
  );
  return {
    comments: comments.map((comment) => ({
      ...comment,
      soapCategory: comment.soapCategory ?? undefined,
    })),
    createdAt: row.created_at,
    createdBy: row.created_by,
    difficultyId: row.difficulty_id ?? undefined,
    id: row.id,
    learningThemeId: row.learning_theme_id ?? undefined,
    materialId: row.material_id ?? undefined,
    recordType: row.record_type ?? undefined,
    rejectionReasonCode: row.rejection_reason_code ?? undefined,
    specialtyId: row.specialty_id ?? undefined,
    status: row.status,
    statusHistory: statusHistory.map((event) => ({
      ...event,
      reasonText: event.reasonText ?? undefined,
    })),
    summary: row.summary,
    title: row.title,
  };
}

async function fetchCandidateById(
  rdsClient: RDSDataClient,
  config: TrainingDataStoreConfig,
  id: string,
  transactionId?: string,
): Promise<MaterialCandidate> {
  const rows = parseRows<CandidateRow>(
    await execute(
      rdsClient,
      config,
      `${CANDIDATE_SELECT} where mc.id = :id::uuid`,
      [stringParam("id", id)],
      transactionId,
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`material candidate not found: ${id}`);
  }
  return mapCandidateRow(row);
}

export async function listMaterialCandidates(
  config: TrainingDataStoreConfig,
  filters: MaterialCandidateFilters = {},
  deps: TrainingDataStoreDeps = {},
): Promise<MaterialCandidate[]> {
  const rdsClient = resolveClient(config, deps);
  const rows = parseRows<CandidateRow>(
    await execute(
      rdsClient,
      config,
      `${CANDIDATE_SELECT}
       where (:specialtyId::text is null or mc.specialty_id = :specialtyId::text)
         and (:recordType::soap_record_type is null or mc.record_type = :recordType::soap_record_type)
         and (:learningThemeId::text is null or mc.learning_theme_id = :learningThemeId::text)
         and (:difficultyId::text is null or mc.difficulty_id = :difficultyId::text)
         and (:status::material_candidate_status is null or mc.status = :status::material_candidate_status)
       order by mc.created_at desc`,
      [
        nullableStringParam("specialtyId", filters.specialtyId),
        nullableStringParam("recordType", filters.recordType),
        nullableStringParam("learningThemeId", filters.learningThemeId),
        nullableStringParam("difficultyId", filters.difficultyId),
        nullableStringParam("status", filters.status),
      ],
    ),
  );
  return rows.map(mapCandidateRow);
}

export type CreateMaterialCandidateInput = {
  title: string;
  summary: string;
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  /** 教材候補化の元になった専門職コメント（1件以上）。 */
  commentIds: string[];
  /** JWT `sub`（uuid 形式）。`app_users.id` の upsert にも使う。 */
  createdBy: string;
  createdByDisplayName?: string;
  /** 初回の状態履歴（candidate）に記録するロールのスナップショット（自由記述）。 */
  createdByRole: string;
};

/** 選択した専門職コメントを束ねて新しい教材候補（status: candidate）を作る。 */
export async function createMaterialCandidateFromComments(
  config: TrainingDataStoreConfig,
  input: CreateMaterialCandidateInput,
  deps: TrainingDataStoreDeps = {},
): Promise<MaterialCandidate> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.createdByDisplayName, id: input.createdBy },
      transactionId,
    );

    const rows = parseRows<{ id: string }>(
      await execute(
        rdsClient,
        config,
        `insert into material_candidates
           (title, summary, specialty_id, record_type, learning_theme_id, difficulty_id, created_by)
         values
           (:title, :summary, :specialtyId, :recordType::soap_record_type, :learningThemeId,
            :difficultyId, :createdBy::uuid)
         returning id`,
        [
          stringParam("title", input.title),
          stringParam("summary", input.summary),
          nullableStringParam("specialtyId", input.specialtyId),
          nullableStringParam("recordType", input.recordType),
          nullableStringParam("learningThemeId", input.learningThemeId),
          nullableStringParam("difficultyId", input.difficultyId),
          stringParam("createdBy", input.createdBy),
        ],
        transactionId,
      ),
    );
    const row = rows[0];
    if (!row) {
      throw new Error("failed to create material_candidate");
    }
    const candidateId = row.id;

    for (const commentId of input.commentIds) {
      await execute(
        rdsClient,
        config,
        `insert into material_candidate_comments (material_candidate_id, comment_id)
         values (:candidateId::uuid, :commentId::uuid)`,
        [
          stringParam("candidateId", candidateId),
          stringParam("commentId", commentId),
        ],
        transactionId,
      );
    }

    await execute(
      rdsClient,
      config,
      `insert into material_candidate_status_events
         (material_candidate_id, from_status, to_status, changed_by, changed_by_role)
       values
         (:candidateId::uuid, null::material_candidate_status, 'candidate'::material_candidate_status,
          :changedBy::uuid, :changedByRole)`,
      [
        stringParam("candidateId", candidateId),
        stringParam("changedBy", input.createdBy),
        stringParam("changedByRole", input.createdByRole),
      ],
      transactionId,
    );

    const created = await fetchCandidateById(
      rdsClient,
      config,
      candidateId,
      transactionId,
    );

    await commitTransaction(rdsClient, config, transactionId);

    return created;
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}

export type DecideMaterialCandidateStatusInput = {
  id: string;
  nextStatus: MaterialCandidateStatus;
  /** JWT `sub`（uuid 形式）。`nextStatus` が approved のとき `approver_id` にも使う。 */
  changedBy: string;
  changedByDisplayName?: string;
  /** 承認/却下/要修正を判断したロールのスナップショット（自由記述）。 */
  changedByRole: string;
  /** `nextStatus` が rejected のとき必須（`material_candidates.rejection_reason_code`）。 */
  reasonCode?: string;
  reasonText?: string;
};

/** 承認/却下/要修正の状態遷移を記録し、`material_candidate_status_events` に承認 gate の経緯を積む。 */
export async function decideMaterialCandidateStatus(
  config: TrainingDataStoreConfig,
  input: DecideMaterialCandidateStatusInput,
  deps: TrainingDataStoreDeps = {},
): Promise<MaterialCandidate> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.changedByDisplayName, id: input.changedBy },
      transactionId,
    );

    const currentRows = parseRows<{ status: MaterialCandidateStatus }>(
      await execute(
        rdsClient,
        config,
        `select status from material_candidates where id = :id::uuid`,
        [stringParam("id", input.id)],
        transactionId,
      ),
    );
    const current = currentRows[0];
    if (!current) {
      throw new Error(`material candidate not found: ${input.id}`);
    }

    await execute(
      rdsClient,
      config,
      `update material_candidates
       set status = :nextStatus::material_candidate_status,
           rejection_reason_code = case
             when :nextStatus::material_candidate_status = 'rejected'::material_candidate_status
             then :reasonCode else rejection_reason_code end,
           approver_id = case
             when :nextStatus::material_candidate_status = 'approved'::material_candidate_status
             then :changedBy::uuid else approver_id end,
           updated_at = now()
       where id = :id::uuid`,
      [
        stringParam("id", input.id),
        stringParam("nextStatus", input.nextStatus),
        nullableStringParam("reasonCode", input.reasonCode),
        stringParam("changedBy", input.changedBy),
      ],
      transactionId,
    );

    await execute(
      rdsClient,
      config,
      `insert into material_candidate_status_events
         (material_candidate_id, from_status, to_status, changed_by, changed_by_role, reason_text)
       values
         (:id::uuid, :fromStatus::material_candidate_status, :nextStatus::material_candidate_status,
          :changedBy::uuid, :changedByRole, :reasonText)`,
      [
        stringParam("id", input.id),
        stringParam("fromStatus", current.status),
        stringParam("nextStatus", input.nextStatus),
        stringParam("changedBy", input.changedBy),
        stringParam("changedByRole", input.changedByRole),
        nullableStringParam("reasonText", input.reasonText),
      ],
      transactionId,
    );

    const updated = await fetchCandidateById(
      rdsClient,
      config,
      input.id,
      transactionId,
    );

    await commitTransaction(rdsClient, config, transactionId);

    return updated;
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}

export type PromoteMaterialCandidateInput = {
  id: string;
  changedBy: string;
  changedByDisplayName?: string;
};

/**
 * 承認済みの教材候補を issue #10 の `materials`（教材種別: `comment_derived_note`、
 * status: draft）に変換し、`material_candidates.material_id` で紐づける
 * （`materials` にはコメント欄が無いため `summary` / `record_type` は引き継がない）。
 */
export async function promoteMaterialCandidateToMaterial(
  config: TrainingDataStoreConfig,
  input: PromoteMaterialCandidateInput,
  deps: TrainingDataStoreDeps = {},
): Promise<MaterialCandidate> {
  const rdsClient = resolveClient(config, deps);
  const transactionId = await beginTransaction(rdsClient, config);

  try {
    await upsertAppUser(
      rdsClient,
      config,
      { displayName: input.changedByDisplayName, id: input.changedBy },
      transactionId,
    );

    const currentRows = parseRows<{
      status: MaterialCandidateStatus;
      title: string;
      specialty_id: string | null;
      learning_theme_id: string | null;
      difficulty_id: string | null;
      material_id: string | null;
    }>(
      await execute(
        rdsClient,
        config,
        `select status, title, specialty_id, learning_theme_id, difficulty_id, material_id
         from material_candidates where id = :id::uuid`,
        [stringParam("id", input.id)],
        transactionId,
      ),
    );
    const current = currentRows[0];
    if (!current) {
      throw new Error(`material candidate not found: ${input.id}`);
    }
    if (current.material_id) {
      throw new MaterialCandidateAlreadyPromotedError(
        `material candidate already promoted to material: ${current.material_id}`,
      );
    }
    if (current.status !== "approved") {
      throw new MaterialCandidateNotApprovedError(
        `material candidate is not approved: ${input.id}`,
      );
    }

    const materialRows = parseRows<{ id: string }>(
      await execute(
        rdsClient,
        config,
        `insert into materials
           (material_type, title, publication_status, specialty_id, learning_theme_id,
            difficulty_id, created_by)
         values
           ('comment_derived_note'::material_type, :title, 'draft'::publication_status,
            :specialtyId, :learningThemeId, :difficultyId, :createdBy::uuid)
         returning id`,
        [
          stringParam("title", current.title),
          nullableStringParam("specialtyId", current.specialty_id ?? undefined),
          nullableStringParam(
            "learningThemeId",
            current.learning_theme_id ?? undefined,
          ),
          nullableStringParam(
            "difficultyId",
            current.difficulty_id ?? undefined,
          ),
          stringParam("createdBy", input.changedBy),
        ],
        transactionId,
      ),
    );
    const materialRow = materialRows[0];
    if (!materialRow) {
      throw new Error("failed to create material");
    }

    await execute(
      rdsClient,
      config,
      `insert into material_revisions (material_id, from_status, to_status, changed_by)
       values (:materialId::uuid, null::publication_status, 'draft'::publication_status, :changedBy::uuid)`,
      [
        stringParam("materialId", materialRow.id),
        stringParam("changedBy", input.changedBy),
      ],
      transactionId,
    );

    await execute(
      rdsClient,
      config,
      `update material_candidates set material_id = :materialId::uuid where id = :id::uuid`,
      [stringParam("id", input.id), stringParam("materialId", materialRow.id)],
      transactionId,
    );

    const updated = await fetchCandidateById(
      rdsClient,
      config,
      input.id,
      transactionId,
    );

    await commitTransaction(rdsClient, config, transactionId);

    return updated;
  } catch (error) {
    await rollbackTransaction(rdsClient, config, transactionId);
    throw error;
  }
}
