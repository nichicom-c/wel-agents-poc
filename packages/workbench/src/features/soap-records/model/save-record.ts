import type {
  SoapDraftCandidate,
  SoapRecordType,
} from "../../soap-draft/index.ts";
import type { SoapRecordItemInput } from "../api/soap-records.ts";

/**
 * 記録種別ごとに、このセッション内で作った recordId を覚えておく（SOAP Studio は
 * session-local なので、再度「正式記録として保存」を押したときに新規記録ではなく
 * 同じ記録へ version を追記できるようにするため）。issue #8 の前提メモが言う
 * 「再度 SOAP Studio で編集し保存すると version_no+1 を追記する」を、記録種別ごとに実現する。
 */
export type SavedRecordIds = Partial<Record<SoapRecordType, string>>;

export function withSavedRecordId(
  saved: SavedRecordIds,
  recordType: SoapRecordType,
  recordId: string,
): SavedRecordIds {
  return { ...saved, [recordType]: recordId };
}

/** 採用/編集済みの候補だけを保存対象にする（却下/後で確認/未対応は含めない）。 */
export function savableItemsFromCandidates(
  candidates: readonly SoapDraftCandidate[],
): SoapRecordItemInput[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.status === "adopted" || candidate.status === "edited",
    )
    .map((candidate) => ({
      category: candidate.category,
      text: candidate.draftText,
    }));
}
