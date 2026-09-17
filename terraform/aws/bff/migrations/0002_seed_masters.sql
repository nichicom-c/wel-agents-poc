-- issue #10 が管理するマスタ（0001_init.sql で定義）の初期値。**id/label の正はこのファイルだけ**で、
-- packages/workbench は BFF `GET /api/masters` 経由でここから取得する（画面側に固定値は持たない）。
-- id は material_candidates / materials の FK として保存されるため、既存データがある状態で id を
-- 変えると参照が切れる。ラベルだけ直す場合は label の update を書き、id は据え置く。

insert into specialties (id, label) values
  ('maternal-child', '母子保健'),
  ('elderly-care', '高齢者福祉'),
  ('mental-health', '精神保健'),
  ('public-health', '地域保健')
on conflict (id) do nothing;

insert into learning_themes (id, label) values
  ('assessment-basics', 'アセスメントの基本'),
  ('support-planning', '支援方針の立案'),
  ('documentation', '記録表現'),
  ('risk-detection', 'リスクの早期発見')
on conflict (id) do nothing;

insert into difficulty_levels (id, label, order_no) values
  ('beginner', '初級', 1),
  ('intermediate', '中級', 2),
  ('advanced', '上級', 3)
on conflict (id) do nothing;

insert into rejection_reason_codes (code, label) values
  ('insufficient_generality', '汎用性が低い'),
  ('personal_identifiable_info', '個人が特定できる情報を含む'),
  ('duplicate_content', '既存教材と重複'),
  ('unclear_rationale', '判断根拠が不明確'),
  ('other', 'その他')
on conflict (code) do nothing;

