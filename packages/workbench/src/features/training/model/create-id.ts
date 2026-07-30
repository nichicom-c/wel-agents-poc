/**
 * React key / dummy データの識別にだけ使う id を作る。`knowledge-review` / `admin` の
 * `model/create-id.ts` と同じ実装だが、feature 間で内部 model を直接 import しない方針
 * （barrel だけを公開 interface にする）のためこちらにも小さく複製する。
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
