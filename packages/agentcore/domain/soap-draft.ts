import type { RuntimeRequest } from "../contracts/runtime.ts";

/** payload が SOAP 下書き生成リクエストかどうか。それ以外（省略含む）は chat として扱う。 */
export function isSoapDraftRequest(payload: RuntimeRequest): boolean {
  return payload.type === "soap_draft";
}

/** payload から有効な SOAP 分類対象テキスト（非空文字列）を取り出す。無ければ undefined。 */
export function getSoapDraftText(payload: RuntimeRequest): string | undefined {
  const { text } = payload;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}
