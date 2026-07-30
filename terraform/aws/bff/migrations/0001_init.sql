-- issue #8 (専門職コメント・教材候補) / issue #9 (演習) / issue #10 (教材・ルーブリック・
-- 参照知識・マスタ) のための初期スキーマ。設計は
-- docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md を参照。
--
-- gen_random_uuid() は PostgreSQL 13 以降で built-in（pgcrypto 拡張は不要）。
-- Aurora PostgreSQL の対象バージョン（scale-to-zero 対応の 15.7+ / 16.3+）は
-- いずれもこれを満たす。

-- =========================================================================
-- Enum 型
-- =========================================================================

create type soap_record_type as enum ('support_activity', 'general_record', 'meeting', 'summary');
create type soap_record_status as enum ('draft', 'finalized');
create type soap_record_version_source as enum ('soap_draft_ai', 'voice_capture', 'manual');
create type soap_category as enum ('S', 'O', 'A', 'P', 'UNCLASSIFIED');
create type comment_type as enum ('review', 'correction_rationale', 'instruction_note', 'case_study');
create type material_candidate_status as enum ('candidate', 'approved', 'rejected', 'needs_revision');
create type material_type as enum ('teaching_case', 'comment_derived_note', 'reference_summary');
create type publication_status as enum ('draft', 'reviewing', 'published', 'archived');
create type rubric_review_status as enum ('expert_review_required', 'confirmed');
create type rubric_target_type as enum ('exercise_feedback', 'material_review');
create type reference_knowledge_source_type as enum ('law', 'medical_care_law', 'internal_note');
create type requirement_level as enum ('required', 'recommended');
create type model_answer_type as enum ('soap', 'assessment', 'support_plan');
create type exercise_attempt_status as enum ('in_progress', 'submitted', 'feedback_ready');
create type feedback_generated_by as enum ('ai', 'instructor');
create type quality_metric_key as enum (
  'classification_accuracy',
  'gap_detection_rate',
  'adoption_rate',
  'correction_rate',
  'bounce_back_rate',
  'learning_effectiveness'
);

-- =========================================================================
-- ロール・マスタ（issue #10 が管理する対象。初期値は 0002_seed_masters.sql で投入する）
-- =========================================================================

-- id はブラウザ表示用の固定 id（packages/workbench の dummy 実装が使う id と一致させる。
-- 例: "maternal-child"）。issue #10 の管理画面から増減できるようにするため enum ではなく
-- マスタテーブルにする。
create table specialties (
  id text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create table learning_themes (
  id text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create table difficulty_levels (
  id text primary key,
  label text not null,
  order_no integer not null,
  created_at timestamptz not null default now()
);

-- 却下理由の分類は issue #8 の Open Question のため、enum ではなく issue #10 が
-- 増減できるマスタテーブルにする。
create table rejection_reason_codes (
  code text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

-- Cognito Group（cognito:groups claim）からミラーする、行レベルの認可・記名に使うロール一覧。
-- packages/bff/domain/auth.ts の authContextFromJwtClaims 拡張で actorId/userId とあわせて導出する想定。
create table app_users (
  id uuid primary key,
  display_name text,
  roles text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- SOAP 正式記録・編集履歴（issue #8 着手の前提。SOAP Studio の「正式記録として保存」から作られる）
-- =========================================================================

create table soap_records (
  id uuid primary key default gen_random_uuid(),
  record_type soap_record_type not null,
  status soap_record_status not null default 'draft',
  created_by uuid not null references app_users (id),
  created_at timestamptz not null default now()
);

-- 記録種別ごとに現在有効なマッピングバージョンを1件だけ持つ。既存記録には遡って適用しない
-- （issue #10）ため、soap_record_versions は生成時点の soap_mapping_version_id を固定で持つ。
create table soap_mapping_versions (
  id uuid primary key default gen_random_uuid(),
  record_type soap_record_type not null,
  version_no integer not null,
  mapping_definition jsonb not null,
  is_current boolean not null default false,
  effective_from timestamptz not null default now(),
  created_by uuid not null references app_users (id),
  unique (record_type, version_no)
);

create index idx_soap_mapping_versions_current
  on soap_mapping_versions (record_type)
  where is_current;

-- 追記専用（UPDATE しない）にすることで、そのまま issue #8 が言う「編集履歴」になる。
create table soap_record_versions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references soap_records (id),
  version_no integer not null,
  content jsonb not null,
  source soap_record_version_source not null,
  soap_mapping_version_id uuid references soap_mapping_versions (id),
  recording_id text,
  created_by uuid not null references app_users (id),
  created_at timestamptz not null default now(),
  unique (record_id, version_no)
);

create index idx_soap_record_versions_record_id on soap_record_versions (record_id);

-- =========================================================================
-- issue #8: 専門職コメント・教材候補
-- =========================================================================

create table professional_comments (
  id uuid primary key default gen_random_uuid(),
  target_record_id uuid not null references soap_records (id),
  target_record_version_id uuid not null references soap_record_versions (id),
  soap_category soap_category,
  comment_type comment_type not null,
  body text not null,
  author_id uuid not null references app_users (id),
  author_role_at_post text not null,
  created_at timestamptz not null default now()
);

create index idx_professional_comments_target_version
  on professional_comments (target_record_version_id);

-- 編集履歴の保持範囲は issue #8 の Open Question。編集時だけ行を追加する設計にして、
-- 「編集不可にする」「全履歴を残す」のどちらの結論でもスキーマ変更なしに対応する。
create table professional_comment_revisions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references professional_comments (id),
  previous_body text not null,
  edited_by uuid not null references app_users (id),
  edited_at timestamptz not null default now()
);

-- issue #10 が管理する教材。issue #8 の教材候補が承認されるとここへ材料として繋がる想定
-- （material_candidates.material_id）。
create table materials (
  id uuid primary key default gen_random_uuid(),
  material_type material_type not null,
  title text not null,
  publication_status publication_status not null default 'draft',
  specialty_id text references specialties (id),
  learning_theme_id text references learning_themes (id),
  difficulty_id text references difficulty_levels (id),
  created_by uuid not null references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table material_revisions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials (id),
  from_status publication_status,
  to_status publication_status not null,
  changed_by uuid not null references app_users (id),
  changed_at timestamptz not null default now()
);

create table material_candidates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  status material_candidate_status not null default 'candidate',
  specialty_id text references specialties (id),
  record_type soap_record_type,
  learning_theme_id text references learning_themes (id),
  difficulty_id text references difficulty_levels (id),
  rejection_reason_code text references rejection_reason_codes (code),
  approver_id uuid references app_users (id),
  material_id uuid references materials (id),
  created_by uuid not null references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_material_candidates_search
  on material_candidates (specialty_id, record_type, learning_theme_id, difficulty_id, status);

-- 1件のコメントを複数の教材候補で再利用したり、複数コメントを束ねて1つの教材候補にできるよう
-- 多対多にする。
create table material_candidate_comments (
  material_candidate_id uuid not null references material_candidates (id),
  comment_id uuid not null references professional_comments (id),
  primary key (material_candidate_id, comment_id)
);

create table material_candidate_status_events (
  id uuid primary key default gen_random_uuid(),
  material_candidate_id uuid not null references material_candidates (id),
  from_status material_candidate_status,
  to_status material_candidate_status not null,
  changed_by uuid not null references app_users (id),
  changed_by_role text not null,
  reason_text text,
  changed_at timestamptz not null default now()
);

create index idx_material_candidate_status_events_candidate
  on material_candidate_status_events (material_candidate_id);

-- =========================================================================
-- issue #10: 評価ルーブリック・参照知識・必須推奨項目・品質指標
-- =========================================================================

create table rubrics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_type rubric_target_type not null,
  review_status rubric_review_status not null default 'expert_review_required',
  version_no integer not null default 1,
  created_by uuid not null references app_users (id),
  created_at timestamptz not null default now()
);

create table rubric_items (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references rubrics (id),
  criterion_name text not null,
  description text,
  order_no integer not null
);

create index idx_rubric_items_rubric_id on rubric_items (rubric_id);

-- external_kb_ref は既存の vector Knowledge Base（law / medical_care_law）上のドキュメントへの
-- 参照であり、内容をこのテーブルへ複製しない。
create table reference_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  source_type reference_knowledge_source_type not null,
  external_kb_ref text,
  created_at timestamptz not null default now()
);

create table material_reference_knowledge (
  material_id uuid not null references materials (id),
  reference_knowledge_id uuid not null references reference_knowledge (id),
  primary key (material_id, reference_knowledge_id)
);

create table rubric_reference_knowledge (
  rubric_id uuid not null references rubrics (id),
  reference_knowledge_id uuid not null references reference_knowledge (id),
  primary key (rubric_id, reference_knowledge_id)
);

create table required_recommended_items (
  id uuid primary key default gen_random_uuid(),
  record_type soap_record_type not null,
  specialty_id text references specialties (id),
  item_name text not null,
  requirement_level requirement_level not null,
  aggregation_category text not null,
  effective_from timestamptz not null default now()
);

create index idx_required_recommended_items_search
  on required_recommended_items (record_type, specialty_id);

-- 実際の集計値は soap_record_versions / material_candidate_status_events / exercise_attempts を
-- 集計する view から取得する（このテーブルは定義だけを持つ。issue #10 の Out of Scope: 目標値・
-- 合格ラインの設定）。
create table quality_metrics_definitions (
  metric_key quality_metric_key primary key,
  display_name text not null,
  calculation_description text not null,
  target_entity text not null
);

-- =========================================================================
-- issue #9: 新人保健師向け演習
-- =========================================================================

-- exercise_cases は materials（material_type: 'teaching_case'）の 1:1 拡張テーブル。
-- 公開状態は materials.publication_status が一元管理する。
create table exercise_cases (
  material_id uuid primary key references materials (id),
  initial_presentation jsonb not null,
  constraints_text text,
  expected_work_scene text,
  required_institutional_knowledge text,
  related_master_refs jsonb
);

create table exercise_followup_questions (
  id uuid primary key default gen_random_uuid(),
  exercise_case_material_id uuid not null references exercise_cases (material_id),
  question_text text not null,
  revealed_info_text text not null,
  order_no integer not null
);

create index idx_exercise_followup_questions_case
  on exercise_followup_questions (exercise_case_material_id);

create table exercise_model_answers (
  id uuid primary key default gen_random_uuid(),
  exercise_case_material_id uuid not null references exercise_cases (material_id),
  answer_type model_answer_type not null,
  content jsonb not null,
  acceptable_note text
);

create index idx_exercise_model_answers_case
  on exercise_model_answers (exercise_case_material_id);

create table exercise_case_rubrics (
  exercise_case_material_id uuid not null references exercise_cases (material_id),
  rubric_id uuid not null references rubrics (id),
  primary key (exercise_case_material_id, rubric_id)
);

create table exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  exercise_case_material_id uuid not null references exercise_cases (material_id),
  trainee_id uuid not null references app_users (id),
  status exercise_attempt_status not null default 'in_progress',
  answer_followups jsonb,
  answer_soap jsonb,
  answer_assessment text,
  answer_support_plan text,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index idx_exercise_attempts_trainee on exercise_attempts (trainee_id);
create index idx_exercise_attempts_case on exercise_attempts (exercise_case_material_id);

create table exercise_feedback (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references exercise_attempts (id),
  generated_by feedback_generated_by not null,
  data_collection_note text,
  rationale_note text,
  assessment_note text,
  support_plan_note text,
  documentation_note text,
  created_at timestamptz not null default now()
);

create index idx_exercise_feedback_attempt on exercise_feedback (attempt_id);

create table exercise_instructor_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references exercise_feedback (id),
  instructor_id uuid not null references app_users (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_exercise_instructor_comments_feedback
  on exercise_instructor_comments (feedback_id);
