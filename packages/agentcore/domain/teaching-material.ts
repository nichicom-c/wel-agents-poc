import type { RuntimeRequest } from "../contracts/runtime.ts";
import type {
  TeachingMaterialClassificationOptions,
  TeachingMaterialOption,
} from "../contracts/teaching-material.ts";

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

/**
 * payload から分類（分野 / 学習テーマ / 難易度）の選択肢を取り出す。
 *
 * BFF が渡さない場合（Training Data Store 未設定など）は空配列になり、分類の推奨は行わない。
 */
export function getTeachingMaterialClassificationOptions(
  payload: RuntimeRequest,
): TeachingMaterialClassificationOptions {
  const raw = asRecord(payload.classification_options);
  return {
    difficultyLevels: normalizeOptions(raw.difficultyLevels),
    learningThemes: normalizeOptions(raw.learningThemes),
    specialties: normalizeOptions(raw.specialties),
  };
}

/** model が返した id が選択肢に実在するときだけ返す（存在しない id は捏造として捨てる）。 */
export function pickKnownOptionId(
  options: TeachingMaterialOption[],
  id: unknown,
): string | undefined {
  const trimmed = typeof id === "string" ? id.trim() : "";
  return options.some((option) => option.id === trimmed) ? trimmed : undefined;
}

function normalizeOptions(value: unknown): TeachingMaterialOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeOption(asRecord(entry)))
    .filter((option): option is TeachingMaterialOption => option !== undefined);
}

function normalizeOption(
  record: Record<string, unknown>,
): TeachingMaterialOption | undefined {
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  return id && label ? { id, label } : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
