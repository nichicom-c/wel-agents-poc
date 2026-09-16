-- issue #10 が管理するマスタ（0001_init.sql で定義）の初期値。id/label は packages/workbench の dummy 実装
-- （features/knowledge-review/model/tags.ts, features/admin/model/material-candidates.ts）が使う
-- 固定値と一致させる。実 DB に切り替えた後もこれらの id をそのまま使えば workbench 側の変更は
-- 不要になる。

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

