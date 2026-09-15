import type { RuntimeRequest } from "../contracts/runtime.ts";

/** payload が教材候補生成リクエストかどうか。それ以外（省略含む）は chat として扱う。 */
export function isTeachingMaterialRequest(payload: RuntimeRequest): boolean {
  return payload.type === "teaching_material";
}

/** payload から有効な生成元テキスト（専門職コメント本文、非空文字列）を取り出す。無ければ undefined。 */
export function getTeachingMaterialSourceText(
  payload: RuntimeRequest,
): string | undefined {
  const { text } = payload;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}
