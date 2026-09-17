/**
 * issue #10 が管理するマスタ（specialties / learning_themes / difficulty_levels /
 * rejection_reason_codes）の contract。DB スキーマは
 * `terraform/aws/bff/migrations/0001_init.sql`、初期値は `0002_seed_masters.sql` に対応する。
 *
 * 分野・学習テーマ・難易度・却下理由は教材候補と教材の検索軸・分類であり、id は
 * `material_candidates` / `materials` の FK として保存される。ラベルを画面側に固定値で持つと
 * DB と二重管理になるため、id/label はこの endpoint 経由で DB から配る。
 */

/** id をそのまま FK に保存する分類マスタの1件。 */
export type MasterOption = {
  id: string;
  label: string;
};

/** 却下理由だけは主キーが `code`（`rejection_reason_codes.code`）。 */
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
