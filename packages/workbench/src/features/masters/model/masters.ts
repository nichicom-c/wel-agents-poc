/**
 * issue #10 が管理するマスタ（分野・学習テーマ・難易度・却下理由）。id/label は BFF
 * `/api/masters` 経由で DB（`specialties` / `learning_themes` / `difficulty_levels` /
 * `rejection_reason_codes`、初期値は `0002_seed_masters.sql`）から取得する。
 *
 * id は `material_candidates` / `materials` の FK として保存されるため、画面側に固定値を持つと
 * DB と二重管理になる。ラベルの追加・変更は seed（または将来の管理 UI）だけで完結させる。
 */

/** id をそのまま FK に保存する分類マスタの1件。 */
export type MasterOption = {
  id: string;
  label: string;
};

/** 却下理由だけは主キーが `code`。 */
export type RejectionReasonOption = {
  code: string;
  label: string;
};

export type Masters = {
  specialties: MasterOption[];
  learningThemes: MasterOption[];
  difficultyLevels: MasterOption[];
  rejectionReasonCodes: RejectionReasonOption[];
};

/** 取得前・取得失敗時に使う空マスタ。select は空、ラベルは id のまま表示される。 */
export const EMPTY_MASTERS: Masters = {
  difficultyLevels: [],
  learningThemes: [],
  rejectionReasonCodes: [],
  specialties: [],
};

/** 未知の id はそのまま表示する（マスタから削除された過去データを落とさない）。 */
export function tagLabel(options: readonly MasterOption[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

/** 未知の code はそのまま表示する（`tagLabel` と同じ方針）。 */
export function rejectionReasonLabel(
  options: readonly RejectionReasonOption[],
  code: string,
): string {
  return options.find((option) => option.code === code)?.label ?? code;
}
