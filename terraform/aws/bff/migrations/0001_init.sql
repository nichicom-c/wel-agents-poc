-- Training Data Store（Aurora Serverless v2 / PostgreSQL）の初期スキーマ。
-- issue #8（専門職コメント・教材候補）/ issue #10（教材・マスタ）と、
-- 保健師SOAP_KB_詳細設計書_v2 の「知識ベース」層（knowledge_base / knowledge_item /
-- rubric / rubric_level / prompt_template）を1ファイルで作り切る。
-- 設計は docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md を参照。
--
-- このファイルは「作ってから alter/drop で直す」履歴を畳んだ後の到達形であり、新規 DB を
-- migrations/*.sql で作り切ったときの最終スキーマと一致する。過去に存在した差分（旧
-- rubrics/rubric_items の置き換え、material_candidates/materials への learning_objective・
-- teaching_points 追加、新人保健師向け演習 exercise_* の追加と撤去、SOAP マッピング
-- soap_mapping_versions と soap_record_versions.soap_mapping_version_id の撤去、品質指標
-- quality_metrics_definitions と quality_metric_key の撤去、必須・推奨項目
-- required_recommended_items と requirement_level の撤去、参照知識 reference_knowledge /
-- material_reference_knowledge / rubric_reference_knowledge と
-- reference_knowledge_source_type の撤去、未使用の professional_comment_revisions と
-- soap_record_versions.recording_id の撤去）は、すべてこの定義に反映済み。
-- migration ランナー（tools/db-migrate/run-migrations.ts）は適用済みファイル名を対象 DB の
-- schema_migrations で管理するため、適用済み DB がこのファイルを再実行することはない。
--
-- [IMPORTANT] このファイルを書き換えるだけでは、既にこのファイルを適用済みの DB は変わらない
-- （schema_migrations にファイル名があるので二度と実行されない）。スキーマを変えたら、差分
-- ファイルを積まずにこのファイルを直接書き換え、drop schema public cascade で DB を作り直す
-- こと。手順と注意（全データが消える）は terraform/aws/bff/README.md の「Training Data Store」
-- 節を参照。
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

-- =========================================================================
-- ロール・マスタ（issue #10 が管理する対象。初期値は 0002_seed_masters.sql で投入する）
-- =========================================================================

-- id は可読な固定文字列（例: "maternal-child"）で、materials / material_candidates の FK になる。
-- issue #10 の管理画面から増減できるようにするため enum ではなくマスタテーブルにする。
-- label は BFF `GET /api/masters` が配り、画面はこれを唯一の正として表示する。
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
-- [WARNING] roles はこのロールモデルが未実装のため常に空配列で、読み書きするコードはまだ無い
-- （現状の記名は professional_comments.author_role_at_post /
-- material_candidate_status_events.changed_by_role の自由記述 text 列だけ）。設計意図を残すため
-- 列は維持しているので、実装時はここを正にする。
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

-- 追記専用（UPDATE しない）にすることで、そのまま issue #8 が言う「編集履歴」になる。
create table soap_record_versions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references soap_records (id),
  version_no integer not null,
  content jsonb not null,
  source soap_record_version_source not null,
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

-- issue #10 が管理する教材。issue #8 の教材候補が承認されるとここへ材料として繋がる想定
-- （material_candidates.material_id）。
-- learning_objective / teaching_points は Training 画面の教材チャットが使う。教材候補からの
-- 教材化（promoteMaterialCandidateToMaterial）で引き継ぐほか、Admin 画面の「新規教材の登録」
-- から直接入力もできるため、どちらも任意（NULL 許容）。
create table materials (
  id uuid primary key default gen_random_uuid(),
  material_type material_type not null,
  title text not null,
  publication_status publication_status not null default 'draft',
  specialty_id text references specialties (id),
  learning_theme_id text references learning_themes (id),
  difficulty_id text references difficulty_levels (id),
  learning_objective text,
  teaching_points jsonb,
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

-- learning_objective / teaching_points は教材候補生成 agent（AgentCore `type:
-- "teaching_material"`）の構造化出力のうち title 以外の2項目。既存データ・既存フローとの
-- 互換のため任意（NULL 許容）。
create table material_candidates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  status material_candidate_status not null default 'candidate',
  specialty_id text references specialties (id),
  record_type soap_record_type,
  learning_theme_id text references learning_themes (id),
  difficulty_id text references difficulty_levels (id),
  learning_objective text,
  teaching_points jsonb,
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
-- Knowledge Base 層（knowledge_base / knowledge_item / rubric / rubric_level /
-- prompt_template）
--
-- 保健師SOAP_KB_詳細設計書_v2（docs/spec/保健師SOAP_KB_詳細設計書_v2.docx）由来。
-- 出典: docs/spec/soap_kb_postgresql_migrations_v2/migrations/001_create_knowledge_base.sql
-- 評価ルーブリックは 8軸×4レベルの rubric / rubric_level がそのまま正。
-- =========================================================================

create table knowledge_base (
    id uuid primary key default gen_random_uuid(),
    code varchar(100) not null,
    name varchar(255) not null,
    description text,
    version varchar(50) not null,
    status varchar(20) not null default 'draft' check (status in ('draft', 'active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (code, version)
);

create table knowledge_item (
    id uuid primary key default gen_random_uuid(),
    knowledge_base_id uuid not null references knowledge_base (id) on delete cascade,
    category varchar(50) not null,
    item_key varchar(150) not null,
    title varchar(255) not null,
    content text not null,
    metadata jsonb not null default '{}'::jsonb,
    version varchar(50) not null default '1.0',
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (knowledge_base_id, category, item_key, version)
);

create table rubric (
    id uuid primary key default gen_random_uuid(),
    knowledge_base_id uuid not null references knowledge_base (id) on delete cascade,
    code varchar(100) not null,
    name varchar(255) not null,
    objective text not null,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (knowledge_base_id, code)
);

create table rubric_level (
    id uuid primary key default gen_random_uuid(),
    rubric_id uuid not null references rubric (id) on delete cascade,
    level integer not null check (level between 1 and 4),
    level_name varchar(50) not null,
    definition text not null,
    criteria jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (rubric_id, level)
);

create table prompt_template (
    id uuid primary key default gen_random_uuid(),
    knowledge_base_id uuid not null references knowledge_base (id) on delete cascade,
    code varchar(100) not null,
    name varchar(255) not null,
    system_prompt text not null,
    user_prompt_template text not null,
    output_schema jsonb not null default '{}'::jsonb,
    version varchar(50) not null default '1.0',
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (knowledge_base_id, code, version)
);

create index idx_knowledge_item_lookup on knowledge_item (knowledge_base_id, category, is_active);
create index idx_rubric_lookup on rubric (knowledge_base_id, is_active, sort_order);
