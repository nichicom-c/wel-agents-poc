-- issue #10 が管理するマスタの初期値。id/label は packages/workbench の dummy 実装
-- （features/knowledge-review/model/tags.ts, features/admin/model/material-candidates.ts,
-- features/admin/model/quality-metrics.ts）が使う固定値と一致させる。実 DB に切り替えた後も
-- これらの id をそのまま使えば workbench 側の変更は不要になる。

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

insert into quality_metrics_definitions (metric_key, display_name, calculation_description, target_entity) values
  (
    'classification_accuracy',
    '分類精度',
    'SOAP 下書き生成 AI の分類（S/O/A/P）が、専門職の採用/編集後の結果と一致した割合。',
    'soap_record_versions'
  ),
  (
    'gap_detection_rate',
    '不足検出率',
    '不足確認（issue #6）が検出した不足のうち、実際に記録の改善につながった割合。',
    'soap_record_versions'
  ),
  (
    'adoption_rate',
    '採用率',
    '教材候補（issue #8）のうち承認済みになった割合。',
    'material_candidate_status_events'
  ),
  (
    'correction_rate',
    '修正率',
    '教材候補のうち要修正を経て承認に至った割合。',
    'material_candidate_status_events'
  ),
  (
    'bounce_back_rate',
    '差し戻し率',
    '教材候補のうち却下された割合。',
    'material_candidate_status_events'
  ),
  (
    'learning_effectiveness',
    '学習効果',
    '新人保健師向け演習（issue #9）で、同一受講者の回答が改善傾向にある割合。',
    'exercise_attempts'
  )
on conflict (metric_key) do nothing;
