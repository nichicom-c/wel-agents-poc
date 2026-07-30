/**
 * React key / dummy データの識別にだけ使う id を作る。`crypto.randomUUID` はセキュアコンテキスト
 * （HTTPS または localhost）でしか使えないブラウザがあるため、非セキュアコンテキスト向けの
 * fallback を持つ（`soap-draft-candidates.ts` の `createCandidateId` と同じ方針）。
 */
export function createId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
