import { isSoapRecordType, type SoapRecordType } from "../model/record-type.ts";
import type { SoapCategory } from "../model/soap-draft-candidates.ts";

const SOAP_DRAFT_ENDPOINT = "/api/soap-draft";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** BFF `/api/soap-draft` が返す候補（client 側の id/status を持たない生データ）。 */
export type SoapDraftApiCandidate = {
  category: SoapCategory;
  draftText: string;
  evidenceQuote: string;
  reasoning: string;
  confidence: number;
};

/**
 * BFF `/api/soap-draft` の response 全体。`recommendedRecordTypes` は個々の候補では
 * なく、入力テキスト全体に対する反映候補（支援実績/汎用記録/会議/サマリー）。
 */
export type SoapDraftApiResult = {
  candidates: SoapDraftApiCandidate[];
  recommendedRecordTypes: SoapRecordType[];
};

export type PostSoapDraftOptions = {
  text: string;
  fetchFn?: FetchFn;
};

/** 入力テキストを SOAP 下書き候補に分類する BFF `/api/soap-draft` を呼ぶ。 */
export async function postSoapDraft({
  text,
  fetchFn = fetch,
}: PostSoapDraftOptions): Promise<SoapDraftApiResult> {
  const cleanedText = text.trim();
  if (!cleanedText) {
    throw new Error("text is required");
  }

  const response = await fetchFn(SOAP_DRAFT_ENDPOINT, {
    body: JSON.stringify({ text: cleanedText }),
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
    candidates: normalizeCandidates(payload.candidates),
    recommendedRecordTypes: normalizeRecordTypes(
      payload.recommendedRecordTypes,
    ),
  };
}

function normalizeCandidates(value: unknown): SoapDraftApiCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeCandidate(asRecord(entry)))
    .filter(
      (candidate): candidate is SoapDraftApiCandidate =>
        candidate !== undefined,
    );
}

function normalizeCandidate(
  record: Record<string, unknown>,
): SoapDraftApiCandidate | undefined {
  const category = record.category;
  if (
    category !== "S" &&
    category !== "O" &&
    category !== "A" &&
    category !== "P" &&
    category !== "UNCLASSIFIED"
  ) {
    return undefined;
  }

  const draftText = trimmedText(record.draftText);
  const evidenceQuote = trimmedText(record.evidenceQuote);
  if (!draftText || !evidenceQuote) {
    return undefined;
  }

  return {
    category,
    draftText,
    evidenceQuote,
    reasoning: trimmedText(record.reasoning),
    confidence: numberOrZero(record.confidence),
  };
}

function normalizeRecordTypes(value: unknown): SoapRecordType[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isSoapRecordType);
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
