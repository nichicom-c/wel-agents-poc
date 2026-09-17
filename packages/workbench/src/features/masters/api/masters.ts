import {
  EMPTY_MASTERS,
  type MasterOption,
  type Masters,
  type RejectionReasonOption,
} from "../model/masters.ts";

/**
 * BFF `/api/masters`（Aurora Serverless v2 + RDS Data API）からマスタを取得する。
 * 画面が固定値を持たないようにするための唯一の取得経路。
 */

const MASTERS_ENDPOINT = "/api/masters";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchMasters(fetchFn: FetchFn = fetch): Promise<Masters> {
  const response = await fetchFn(MASTERS_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return {
    difficultyLevels: normalizeOptions(payload.difficultyLevels),
    learningThemes: normalizeOptions(payload.learningThemes),
    rejectionReasonCodes: normalizeRejectionReasons(
      payload.rejectionReasonCodes,
    ),
    specialties: normalizeOptions(payload.specialties),
  };
}

function normalizeOptions(value: unknown): MasterOption[] {
  if (!Array.isArray(value)) {
    return EMPTY_MASTERS.specialties;
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const id = trimmedText(record.id);
      const label = trimmedText(record.label);
      return id && label ? { id, label } : undefined;
    })
    .filter((option): option is MasterOption => option !== undefined);
}

function normalizeRejectionReasons(value: unknown): RejectionReasonOption[] {
  if (!Array.isArray(value)) {
    return EMPTY_MASTERS.rejectionReasonCodes;
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const code = trimmedText(record.code);
      const label = trimmedText(record.label);
      return code && label ? { code, label } : undefined;
    })
    .filter((option): option is RejectionReasonOption => option !== undefined);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return asRecord(await response.json());
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
