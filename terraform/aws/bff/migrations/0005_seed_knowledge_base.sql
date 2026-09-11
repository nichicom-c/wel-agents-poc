-- 保健師SOAP_KB_詳細設計書_v2 の Knowledge Base 層（0004_create_knowledge_base.sql）の
-- 初期データ。出典: docs/spec/soap_kb_postgresql_migrations_v2/seeds/001_sample_data.sql
-- （case_record/soap_record/expert_review 以降は対象外。今回導入するのは
-- knowledge_base/knowledge_item/rubric/rubric_level/prompt_template のみ）。

insert into knowledge_base (id, code, name, description, version, status) values
  (
    '10000000-0000-0000-0000-000000000001',
    'PHN_SOAP_TRAINING',
    '新人保健師 SOAP教育 Knowledge Base',
    'SOAP記録、ルーブリック評価、教育的フィードバック、専門職レビュー教材化のためのKB',
    '1.0',
    'active'
  )
on conflict (code, version) do nothing;

insert into knowledge_item (id, knowledge_base_id, category, item_key, title, content, metadata) values
  (
    '11000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'SOAP_RULE',
    'subjective_definition',
    'S: Subjective',
    '本人・家族などから語られた主観的情報。本人の発言を専門職の解釈に置き換えず、入力にない内容を推測して追加しない。',
    '{"soap":"S"}'
  ),
  (
    '11000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'SOAP_RULE',
    'objective_definition',
    'O: Objective',
    '測定、観察、記録、検査などによって確認できる客観的情報。',
    '{"soap":"O"}'
  ),
  (
    '11000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'SOAP_RULE',
    'assessment_definition',
    'A: Assessment',
    'S/Oその他の確認情報を統合し、健康課題、リスク、強み、支援の必要性を評価する。Oの単なる言い換えで終わらせない。',
    '{"soap":"A"}'
  ),
  (
    '11000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'SOAP_RULE',
    'plan_definition',
    'P: Plan',
    'Assessmentを踏まえて、今後の確認、支援、連携、フォローアップ計画を設定する。',
    '{"soap":"P"}'
  ),
  (
    '11000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'SAFETY',
    'no_fabrication',
    '事実の捏造禁止',
    '入力されていない事実を作らない。不足情報は追加確認事項として提示する。',
    '{"priority":"highest"}'
  )
on conflict (knowledge_base_id, category, item_key, version) do nothing;

insert into rubric (id, knowledge_base_id, code, name, objective, sort_order) values
  ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'INFORMATION_COLLECTION', '情報収集', 'Assessmentに必要な情報を収集できる', 10),
  ('12000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'SUBJECTIVE_OBJECTIVE', 'S/Oの分類', '主観的情報と客観的事実を適切に区別できる', 20),
  ('12000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'INFORMATION_INTEGRATION', '情報の関連付け', '情報間の関連性を検討できる', 30),
  ('12000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'ASSESSMENT', 'アセスメント', 'S/Oを根拠に健康課題、リスク、強み、支援必要性を評価できる', 40),
  ('12000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'MISSING_INFORMATION', '不足情報の認識', '情報不足を認識し、推測せず追加確認事項として扱える', 50),
  ('12000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'PLAN', '支援計画', 'Assessmentを踏まえ、具体的で本人に適した支援計画を考えられる', 60),
  ('12000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'PERSON_CENTERED', '本人中心の支援', '本人の希望、価値観、生活背景、強みを考慮できる', 70),
  ('12000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'DOCUMENTATION', '記録品質', '他の専門職が読んでも状況、判断、今後の方針を理解できる', 80)
on conflict (knowledge_base_id, code) do nothing;

insert into rubric_level (id, rubric_id, level, level_name, definition, criteria)
select gen_random_uuid(), r.id, v.level, v.level_name, v.definition, v.criteria::jsonb
from rubric r cross join (values
  (1, '要支援', '基本的な整理や判断に指導者の支援を必要とする', '["重要な不足や根拠のない判断がある"]'),
  (2, '基礎', '基本的な対応はできるが、根拠説明や関連付けに支援を必要とする', '["基本的な対応はできる","一部に不足がある"]'),
  (3, '自立', '根拠を示しながら一連の判断を自立して行える', '["根拠関係を説明できる"]'),
  (4, '熟達', '複数の可能性を比較し、統合して優先順位を判断できる', '["優先順位と理由を説明できる"]')
) as v(level, level_name, definition, criteria)
where r.knowledge_base_id = '10000000-0000-0000-0000-000000000001'
on conflict (rubric_id, level) do nothing;

insert into prompt_template (id, knowledge_base_id, code, name, system_prompt, user_prompt_template, output_schema, version) values
  (
    '13000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'SOAP_TRAINING_REVIEW',
    '新人保健師SOAPレビュー',
    'あなたは新人保健師のSOAP記録とアセスメント能力を育成する支援AIです。入力にない事実を作らず、不足情報を推測で補わないでください。',
    'ケース: {{case_information}}\nS: {{subjective}}\nO: {{objective}}\nA: {{assessment}}\nP: {{plan}}',
    '{"type":"object"}',
    '1.0'
  )
on conflict (knowledge_base_id, code, version) do nothing;
