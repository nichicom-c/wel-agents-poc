import type { SoapCategory, SoapRecordType } from "../../soap-draft/index.ts";

const SOAP_RECORDS_ENDPOINT = "/api/soap-records";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SoapRecordVersionSource =
  | "soap_draft_ai"
  | "voice_capture"
  | "manual";

export type SoapRecordItemInput = {
  category: SoapCategory;
  text: string;
};

export type PostSoapRecordInput = {
  /** 既存記録に版を追記する場合に指定する（省略時は新規記録 + version 1 を作る）。 */
  recordId?: string;
  recordType: SoapRecordType;
  items: SoapRecordItemInput[];
  source: SoapRecordVersionSource;
  fetchFn?: FetchFn;
};

export type PostSoapRecordResult = {
  recordId: string;
  versionId: string;
  versionNo: number;
};

/** SOAP Studio の「正式記録として保存」（issue #8 の前提）で BFF `/api/soap-records` を呼ぶ。 */
export async function postSoapRecord({
  fetchFn = fetch,
  items,
  recordId,
  recordType,
  source,
}: PostSoapRecordInput): Promise<PostSoapRecordResult> {
  if (items.length === 0) {
    throw new Error("items is required");
  }

  const response = await fetchFn(SOAP_RECORDS_ENDPOINT, {
    body: JSON.stringify({
      items,
      ...(recordId ? { recordId } : {}),
      recordType,
      source,
    }),
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

  const recordIdValue = trimmedText(payload.recordId);
  const versionId = trimmedText(payload.versionId);
  const versionNo = numberOrZero(payload.versionNo);
  if (!recordIdValue || !versionId) {
    throw new Error("invalid response from /api/soap-records");
  }

  return { recordId: recordIdValue, versionId, versionNo };
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
