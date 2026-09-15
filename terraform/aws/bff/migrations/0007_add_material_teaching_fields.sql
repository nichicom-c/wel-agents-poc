-- Training 画面で公開済み教材を使った Chat 機能を成立させるため、`materials` にも
-- （`material_candidates` と同じ）`learning_objective` / `teaching_points` を追加する。
-- 教材候補の承認・教材化（`promoteMaterialCandidateToMaterial`）はこの2列を引き継ぐが、
-- 手動登録された教材（Admin 画面の「新規教材の登録」）でも直接入力できるよう、
-- どちらも任意（NULL 許容）にする。

alter table materials
  add column learning_objective text,
  add column teaching_points jsonb;
