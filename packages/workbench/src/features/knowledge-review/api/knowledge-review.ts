import {
  isSoapRecordType,
  SOAP_CATEGORIES,
  type SoapRecordType,
} from "../../soap-draft/index.ts";
import {
  isMaterialCandidateStatus,
  isRejectionReasonCode,
  type MaterialCandidate,
  type MaterialCandidateFilters,
  type MaterialCandidateStatus,
  type MaterialCandidateStatusEvent,
} from "../model/material-candidates.ts";
import {
  type CommentType,
  isCommentType,
  type ProfessionalComment,
} from "../model/professional-comments.ts";
import type {
  SoapRecordSummary,
  SoapRecordVersion,
  SoapRecordVersionItem,
} from "../model/soap-records.ts";

/**
 * BFF `/api/material-candidates` / `/api/professional-comments` / `/api/soap-records*`
 * （Aurora Serverless v2 + RDS Data API、issue #8。
 * `docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）を呼ぶ。
 */

const MATERIAL_CANDIDATES_ENDPOINT = "/api/material-candidates";
const PROFESSIONAL_COMMENTS_ENDPOINT = "/api/professional-comments";
const SOAP_RECORDS_ENDPOINT = "/api/soap-records";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function listMaterialCandidates(
  filters: MaterialCandidateFilters = {},
  fetchFn: FetchFn = fetch,
): Promise<MaterialCandidate[]> {
  const query = new URLSearchParams();
  if (filters.specialtyId) {
    query.set("specialtyId", filters.specialtyId);
  }
  if (filters.recordType) {
    query.set("recordType", filters.recordType);
  }
  if (filters.learningThemeId) {
    query.set("learningThemeId", filters.learningThemeId);
  }
  if (filters.difficultyId) {
    query.set("difficultyId", filters.difficultyId);
  }
  if (filters.status) {
    query.set("status", filters.status);
  }
  const queryString = query.toString();

  const response = await fetchFn(
    queryString
      ? `${MATERIAL_CANDIDATES_ENDPOINT}?${queryString}`
      : MATERIAL_CANDIDATES_ENDPOINT,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeCandidates(payload.candidates);
}

export type DecideMaterialCandidateStatusOptions = {
  reasonCode?: string;
  reasonText?: string;
};

/** 承認/却下/要修正の状態遷移を BFF に記録する（承認 gate）。 */
export async function decideCandidateStatus(
  id: string,
  nextStatus: MaterialCandidateStatus,
  changedByRole: string,
  options: DecideMaterialCandidateStatusOptions = {},
  fetchFn: FetchFn = fetch,
): Promise<MaterialCandidate> {
  const response = await fetchFn(
    `${MATERIAL_CANDIDATES_ENDPOINT}/${encodeURIComponent(id)}/status`,
    {
      body: JSON.stringify({
        changedByRole,
        reasonCode: options.reasonCode,
        reasonText: options.reasonText,
        status: nextStatus,
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const candidate = normalizeCandidate(payload);
  if (!candidate) {
    throw new Error(
      "invalid response from /api/material-candidates/:id/status",
    );
  }
  return candidate;
}

export type NewMaterialCandidateInput = {
  title: string;
  summary: string;
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  commentIds: string[];
  createdByRole: string;
};

/** 選択した専門職コメントを束ねて新しい教材候補（status: candidate）を作る。 */
export async function createCandidateFromComments(
  input: NewMaterialCandidateInput,
  fetchFn: FetchFn = fetch,
): Promise<MaterialCandidate> {
  const response = await fetchFn(MATERIAL_CANDIDATES_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const candidate = normalizeCandidate(payload);
  if (!candidate) {
    throw new Error("invalid response from /api/material-candidates");
  }
  return candidate;
}

export async function listCommentsForVersion(
  targetRecordVersionId: string,
  fetchFn: FetchFn = fetch,
): Promise<ProfessionalComment[]> {
  const response = await fetchFn(
    `${PROFESSIONAL_COMMENTS_ENDPOINT}?targetRecordVersionId=${encodeURIComponent(targetRecordVersionId)}`,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeComments(payload.comments);
}

export type NewProfessionalCommentInput = {
  targetRecordId: string;
  targetRecordVersionId: string;
  soapCategory?: SoapRecordVersionItem["category"];
  commentType: CommentType;
  body: string;
  authorRoleAtPost: string;
};

export async function postComment(
  input: NewProfessionalCommentInput,
  fetchFn: FetchFn = fetch,
): Promise<ProfessionalComment> {
  const response = await fetchFn(PROFESSIONAL_COMMENTS_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const comment = normalizeComment(payload);
  if (!comment) {
    throw new Error("invalid response from /api/professional-comments");
  }
  return comment;
}

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

function normalizeCandidates(value: unknown): MaterialCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeCandidate(asRecord(entry)))
    .filter(
      (candidate): candidate is MaterialCandidate => candidate !== undefined,
    );
}

function normalizeCandidate(
  record: Record<string, unknown>,
): MaterialCandidate | undefined {
  const id = trimmedText(record.id);
  const title = trimmedText(record.title);
  const summary = trimmedText(record.summary);
  const status = record.status;
  const createdBy = trimmedText(record.createdBy);
  const createdAt = trimmedText(record.createdAt);

  if (
    !id ||
    !title ||
    !summary ||
    !isMaterialCandidateStatus(status) ||
    !createdBy ||
    !createdAt
  ) {
    return undefined;
  }

  const rawRecordType = record.recordType;
  const rawRejectionReasonCode = record.rejectionReasonCode;

  return {
    comments: normalizeComments(record.comments),
    createdAt,
    createdBy,
    difficultyId: trimmedText(record.difficultyId) || undefined,
    id,
    learningThemeId: trimmedText(record.learningThemeId) || undefined,
    recordType: isSoapRecordType(rawRecordType) ? rawRecordType : undefined,
    rejectionReasonCode: isRejectionReasonCode(rawRejectionReasonCode)
      ? rawRejectionReasonCode
      : undefined,
    specialtyId: trimmedText(record.specialtyId) || undefined,
    status,
    statusHistory: normalizeStatusHistory(record.statusHistory),
    summary,
    title,
  };
}

function normalizeStatusHistory(
  value: unknown,
): MaterialCandidateStatusEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeStatusEvent(asRecord(entry)))
    .filter(
      (event): event is MaterialCandidateStatusEvent => event !== undefined,
    );
}

function normalizeStatusEvent(
  record: Record<string, unknown>,
): MaterialCandidateStatusEvent | undefined {
  const rawFromStatus = record.fromStatus;
  const toStatus = record.toStatus;
  const changedBy = trimmedText(record.changedBy);
  const changedByRole = trimmedText(record.changedByRole);
  const changedAt = trimmedText(record.changedAt);

  if (!isMaterialCandidateStatus(toStatus) || !changedBy || !changedAt) {
    return undefined;
  }

  return {
    changedAt,
    changedBy,
    changedByRole,
    fromStatus: isMaterialCandidateStatus(rawFromStatus) ? rawFromStatus : null,
    reasonText: trimmedText(record.reasonText) || undefined,
    toStatus,
  };
}

function normalizeComments(value: unknown): ProfessionalComment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeComment(asRecord(entry)))
    .filter((comment): comment is ProfessionalComment => comment !== undefined);
}

function normalizeComment(
  record: Record<string, unknown>,
): ProfessionalComment | undefined {
  const id = trimmedText(record.id);
  const targetRecordId = trimmedText(record.targetRecordId);
  const targetRecordVersionId = trimmedText(record.targetRecordVersionId);
  const commentType = record.commentType;
  const body = trimmedText(record.body);
  const authorId = trimmedText(record.authorId);
  const authorName = trimmedText(record.authorName);
  const authorRoleAtPost = trimmedText(record.authorRoleAtPost);
  const createdAt = trimmedText(record.createdAt);

  if (
    !id ||
    !targetRecordId ||
    !targetRecordVersionId ||
    !isCommentType(commentType) ||
    !body ||
    !authorId ||
    !authorName ||
    !authorRoleAtPost ||
    !createdAt
  ) {
    return undefined;
  }

  const rawSoapCategory = record.soapCategory;

  return {
    authorId,
    authorName,
    authorRoleAtPost,
    body,
    commentType,
    createdAt,
    id,
    soapCategory:
      typeof rawSoapCategory === "string" &&
      (SOAP_CATEGORIES as readonly string[]).includes(rawSoapCategory)
        ? (rawSoapCategory as SoapRecordVersionItem["category"])
        : undefined,
    targetRecordId,
    targetRecordVersionId,
  };
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
