import type {
  SoapCategory,
  SoapDraftApiCandidate,
} from "../../soap-draft/index.ts";
import { type GapType, isGapType } from "../model/gap-type.ts";

const SOAP_GAPS_ENDPOINT = "/api/soap-gaps";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** BFF `/api/soap-gaps` が返す、ルールベースで検出した不足そのもの（常に表示できる）。 */
export type GapApiItem = {
  gapType: GapType;
  soapCategory: SoapCategory;
  targetItem: string;
  detail: string;
  relatedEvidenceQuotes: string[];
  skippable: boolean;
};

/** BFF `/api/soap-gaps` が返す、優先度上位を自然文化した（または fallback の）質問。 */
export type GapQuestionApiItem = {
  gapType: GapType;
  soapCategory: SoapCategory;
  targetItem: string;
  questionText: string;
  skippable: boolean;
};

export type SoapGapsApiResult = {
  gaps: GapApiItem[];
  questions: GapQuestionApiItem[];
};

export type PostSoapGapsOptions = {
  candidates: SoapDraftApiCandidate[];
  fetchFn?: FetchFn;
};

/** 既存の SOAP 下書き候補を不足確認にかける BFF `/api/soap-gaps` を呼ぶ。 */
export async function postSoapGaps({
  candidates,
  fetchFn = fetch,
}: PostSoapGapsOptions): Promise<SoapGapsApiResult> {
  if (candidates.length === 0) {
    throw new Error("candidates is required");
  }

  const response = await fetchFn(SOAP_GAPS_ENDPOINT, {
    body: JSON.stringify({ candidates }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      trimmedText(payload.error) ||
        trimmedText(payload.message) ||
        `HTTP ${response.status}`,
    );
  }

  return {
    gaps: normalizeGaps(payload.gaps),
    questions: normalizeQuestions(payload.questions),
  };
}

function normalizeGaps(value: unknown): GapApiItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeGap(asRecord(entry)))
    .filter((gap): gap is GapApiItem => gap !== undefined);
}

function normalizeGap(record: Record<string, unknown>): GapApiItem | undefined {
  if (!isGapType(record.gapType) || !isSoapCategory(record.soapCategory)) {
    return undefined;
  }
  const targetItem = trimmedText(record.targetItem);
  const detail = trimmedText(record.detail);
  if (!targetItem || !detail) {
    return undefined;
  }
  return {
    gapType: record.gapType,
    soapCategory: record.soapCategory,
    targetItem,
    detail,
    relatedEvidenceQuotes: Array.isArray(record.relatedEvidenceQuotes)
      ? record.relatedEvidenceQuotes.filter(
          (quote): quote is string =>
            typeof quote === "string" && quote.trim() !== "",
        )
      : [],
    skippable: record.skippable === true,
  };
}

function normalizeQuestions(value: unknown): GapQuestionApiItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeQuestion(asRecord(entry)))
    .filter(
      (question): question is GapQuestionApiItem => question !== undefined,
    );
}

function normalizeQuestion(
  record: Record<string, unknown>,
): GapQuestionApiItem | undefined {
  if (!isGapType(record.gapType) || !isSoapCategory(record.soapCategory)) {
    return undefined;
  }
  const targetItem = trimmedText(record.targetItem);
  const questionText = trimmedText(record.questionText);
  if (!targetItem || !questionText) {
    return undefined;
  }
  return {
    gapType: record.gapType,
    soapCategory: record.soapCategory,
    targetItem,
    questionText,
    skippable: record.skippable === true,
  };
}

function isSoapCategory(value: unknown): value is SoapCategory {
  return (
    value === "S" ||
    value === "O" ||
    value === "A" ||
    value === "P" ||
    value === "UNCLASSIFIED"
  );
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
