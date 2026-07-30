import { isSoapRecordType, SOAP_CATEGORIES } from "../../soap-draft/index.ts";
import {
  createMaterialCandidateFromComments,
  type DecideMaterialCandidateStatusOptions,
  decideMaterialCandidateStatus,
  filterMaterialCandidates,
  type MaterialCandidate,
  type MaterialCandidateFilters,
  type MaterialCandidateStatus,
  type NewMaterialCandidateInput,
} from "../model/material-candidates.ts";
import {
  createComment,
  filterCommentsByVersion,
  type NewProfessionalCommentInput,
  type ProfessionalComment,
} from "../model/professional-comments.ts";
import type {
  SoapRecordSummary,
  SoapRecordVersion,
  SoapRecordVersionItem,
} from "../model/soap-records.ts";

/**
 * BFF `/api/material-candidates` 等（`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md`
 * の AWS インフラ提案を参照）はまだ存在しないため、issue #8 の UI を dummy データで先行実装する。
 * module 内の変数を DB の代わりに使い、関数の入出力（Promise を返す非同期関数）だけは将来の
 * 実 API 呼び出しに置き換えやすい形にしておく。ブラウザを再読み込みすると内容はリセットされる。
 *
 * ただし SOAP 正式記録・編集履歴（`soap_records` / `soap_record_versions`）だけは、SOAP Studio の
 * 「正式記録として保存」から BFF `/api/soap-records*`（Aurora Serverless v2 + RDS Data API）を
 * 実際に呼ぶようになったため、この2つだけ dummy データではなく下の `listSoapRecords` /
 * `listVersionsForRecord` で実 API を呼ぶ（コメント・教材候補は引き続き dummy）。そのため、下の
 * `DUMMY_COMMENTS` が参照する `targetRecordId` / `targetRecordVersionId`（"record-1" 等）は
 * 実際の記録には対応しない、issue #8 の UI 単体確認用の値のまま残る。
 */

const DUMMY_COMMENTS: ProfessionalComment[] = [
  createComment({
    authorName: "鈴木 reviewer",
    authorRole: "reviewer",
    body:
      "パートナーの育児参加状況を確認する視点は良い。次回訪問前に確認項目リストへ入れておくと" +
      "他のケースでも再利用できる。",
    commentType: "review",
    soapCategory: "P",
    targetRecordId: "record-1",
    targetRecordVersionId: "record-1-v2",
  }),
  createComment({
    authorName: "鈴木 reviewer",
    authorRole: "reviewer",
    body:
      "v1 では『疲労蓄積のリスク』止まりだったが、v2 でパートナーの育児参加という具体的な" +
      "追加確認事項が入ったことで支援方針が一段具体化した。この「A の後にもう一段掘る」思考経路は" +
      "新人向けの教材になりそう。",
    commentType: "case_study",
    soapCategory: "A",
    targetRecordId: "record-1",
    targetRecordVersionId: "record-1-v2",
  }),
  createComment({
    authorName: "高橋 nurse",
    authorRole: "nurse",
    body:
      "屋外歩行時のふらつきという O の記載から、社会的孤立という A に飛ぶ論理を、次回は" +
      "「外出頻度の変化」のような中間の O も併記すると根拠が伝わりやすい。",
    commentType: "instruction_note",
    soapCategory: "A",
    targetRecordId: "record-2",
    targetRecordVersionId: "record-2-v1",
  }),
];

let candidates: MaterialCandidate[] = [
  {
    commentIds: [DUMMY_COMMENTS[1]?.id ?? ""],
    createdAt: "2026-07-19T10:00:00.000Z",
    createdBy: "鈴木 reviewer",
    difficultyId: "intermediate",
    id: "candidate-1",
    learningThemeId: "support-planning",
    recordType: "support_activity",
    specialtyId: "maternal-child",
    status: "candidate",
    statusHistory: [
      {
        changedAt: "2026-07-19T10:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: null,
        toStatus: "candidate",
      },
    ],
    summary:
      "アセスメントで一段掘り下げて追加確認事項を具体化し、支援方針を精緻化する思考経路の例。",
    title: "「疲労蓄積」から一段掘り下げるアセスメントの型",
  },
  {
    commentIds: [DUMMY_COMMENTS[2]?.id ?? ""],
    createdAt: "2026-07-19T10:30:00.000Z",
    createdBy: "高橋 nurse",
    difficultyId: "beginner",
    id: "candidate-2",
    learningThemeId: "documentation",
    recordType: "general_record",
    specialtyId: "elderly-care",
    status: "approved",
    statusHistory: [
      {
        changedAt: "2026-07-19T10:30:00.000Z",
        changedBy: "高橋 nurse",
        fromStatus: null,
        toStatus: "candidate",
      },
      {
        changedAt: "2026-07-20T09:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: "candidate",
        toStatus: "approved",
      },
    ],
    summary:
      "O と A の間に中間の観察事項を挟むことで根拠を伝わりやすくする記録表現の例。",
    title: "O から A への飛躍を防ぐ中間観察の書き方",
  },
  {
    commentIds: [],
    createdAt: "2026-07-15T09:00:00.000Z",
    createdBy: "田中 professional",
    difficultyId: "beginner",
    id: "candidate-3",
    learningThemeId: "assessment-basics",
    recordType: "meeting",
    specialtyId: "public-health",
    status: "rejected",
    rejectionReasonCode: "personal_identifiable_info",
    statusHistory: [
      {
        changedAt: "2026-07-15T09:00:00.000Z",
        changedBy: "田中 professional",
        fromStatus: null,
        toStatus: "candidate",
      },
      {
        changedAt: "2026-07-16T09:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: "candidate",
        reasonCode: "personal_identifiable_info",
        reasonText:
          "会議メモに世帯名がそのまま残っていたため。匿名化して再提出を検討。",
        toStatus: "rejected",
      },
    ],
    summary: "会議記録から抽出した支援方針決定の経緯（要匿名化）。",
    title: "多職種会議での方針転換プロセス",
  },
  {
    commentIds: [],
    createdAt: "2026-07-22T13:00:00.000Z",
    createdBy: "佐藤 professional",
    difficultyId: "advanced",
    id: "candidate-4",
    learningThemeId: "risk-detection",
    recordType: "summary",
    specialtyId: "mental-health",
    status: "needs_revision",
    statusHistory: [
      {
        changedAt: "2026-07-22T13:00:00.000Z",
        changedBy: "佐藤 professional",
        fromStatus: null,
        toStatus: "candidate",
      },
      {
        changedAt: "2026-07-23T09:00:00.000Z",
        changedBy: "鈴木 reviewer",
        fromStatus: "candidate",
        reasonText:
          "サマリー1件だけでは判断根拠が弱いため、類似ケースをもう1件追加してほしい。",
        toStatus: "needs_revision",
      },
    ],
    summary: "リスクの早期発見に繋がったサマリー記録の抜粋。",
    title: "サマリーからのリスク兆候の読み取り",
  },
];

let comments: ProfessionalComment[] = [...DUMMY_COMMENTS];

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export async function listMaterialCandidates(
  filters: MaterialCandidateFilters = {},
): Promise<MaterialCandidate[]> {
  return delay(filterMaterialCandidates(candidates, filters));
}

export async function decideCandidateStatus(
  id: string,
  nextStatus: MaterialCandidateStatus,
  changedBy: string,
  options: DecideMaterialCandidateStatusOptions = {},
): Promise<MaterialCandidate[]> {
  candidates = decideMaterialCandidateStatus(
    candidates,
    id,
    nextStatus,
    changedBy,
    options,
  );
  return delay(candidates);
}

export async function createCandidateFromComments(
  input: NewMaterialCandidateInput,
): Promise<MaterialCandidate[]> {
  candidates = createMaterialCandidateFromComments(candidates, input);
  return delay(candidates);
}

const SOAP_RECORDS_ENDPOINT = "/api/soap-records";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** BFF `/api/soap-records` を呼び、SOAP Studio が保存した正式記録の一覧を取得する。 */
export async function listSoapRecords(
  fetchFn: FetchFn = fetch,
): Promise<SoapRecordSummary[]> {
  const response = await fetchFn(SOAP_RECORDS_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeRecordSummaries(payload.records);
}

/** BFF `/api/soap-records/:recordId/versions` を呼び、指定記録の版一覧（編集履歴）を取得する。 */
export async function listVersionsForRecord(
  recordId: string,
  fetchFn: FetchFn = fetch,
): Promise<SoapRecordVersion[]> {
  const response = await fetchFn(
    `${SOAP_RECORDS_ENDPOINT}/${encodeURIComponent(recordId)}/versions`,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeVersions(payload.versions);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}));
  return asRecord(payload);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRecordSummaries(value: unknown): SoapRecordSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeRecordSummary(asRecord(entry)))
    .filter((record): record is SoapRecordSummary => record !== undefined);
}

function normalizeRecordSummary(
  record: Record<string, unknown>,
): SoapRecordSummary | undefined {
  const id = trimmedText(record.id);
  const recordType = record.recordType;
  const status = record.status;
  const createdBy = trimmedText(record.createdBy);
  const createdAt = trimmedText(record.createdAt);

  if (
    !id ||
    !isSoapRecordType(recordType) ||
    (status !== "draft" && status !== "finalized") ||
    !createdBy ||
    !createdAt
  ) {
    return undefined;
  }

  return { createdAt, createdBy, id, recordType, status };
}

function normalizeVersions(value: unknown): SoapRecordVersion[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeVersion(asRecord(entry)))
    .filter((version): version is SoapRecordVersion => version !== undefined);
}

function normalizeVersion(
  record: Record<string, unknown>,
): SoapRecordVersion | undefined {
  const id = trimmedText(record.id);
  const recordId = trimmedText(record.recordId);
  const versionNo = numberOrZero(record.versionNo);
  const items = normalizeItems(record.items);
  const source = record.source;
  const createdBy = trimmedText(record.createdBy);
  const createdAt = trimmedText(record.createdAt);

  if (
    !id ||
    !recordId ||
    versionNo <= 0 ||
    items.length === 0 ||
    (source !== "soap_draft_ai" &&
      source !== "voice_capture" &&
      source !== "manual") ||
    !createdBy ||
    !createdAt
  ) {
    return undefined;
  }

  return { createdAt, createdBy, id, items, recordId, source, versionNo };
}

function normalizeItems(value: unknown): SoapRecordVersionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeItem(asRecord(entry)))
    .filter((item): item is SoapRecordVersionItem => item !== undefined);
}

function normalizeItem(
  record: Record<string, unknown>,
): SoapRecordVersionItem | undefined {
  const category = record.category;
  const text = trimmedText(record.text);

  if (
    typeof category !== "string" ||
    !(SOAP_CATEGORIES as readonly string[]).includes(category) ||
    !text
  ) {
    return undefined;
  }

  return { category: category as SoapRecordVersionItem["category"], text };
}

export async function listCommentsForVersion(
  targetRecordVersionId: string,
): Promise<ProfessionalComment[]> {
  return delay(filterCommentsByVersion(comments, targetRecordVersionId));
}

export async function postComment(
  input: NewProfessionalCommentInput,
): Promise<ProfessionalComment> {
  const created = createComment(input);
  comments = [...comments, created];
  return delay(created);
}

export function getCommentById(id: string): ProfessionalComment | undefined {
  return comments.find((comment) => comment.id === id);
}
