-- 保健師SOAP_KB_詳細設計書_v2（docs/spec/保健師SOAP_KB_詳細設計書_v2.docx）の
-- 「知識ベース」層のみを既存 Aurora クラスタへ追加する。
-- 出典: docs/spec/soap_kb_postgresql_migrations_v2/migrations/001_create_knowledge_base.sql
--
-- 旧 rubrics/rubric_items（issue #10 ベース、0001_init.sql）は、より詳細な
-- rubric/rubric_level（8軸×4レベル）へ置き換える。PoC データのため既存の
-- rubrics/rubric_items/exercise_case_rubrics/rubric_reference_knowledge の中身は保持しない。
--
-- gen_random_uuid() は PostgreSQL 13 以降で built-in のため、pgcrypto 拡張は不要
-- （0001_init.sql と同じ前提）。

-- =========================================================================
-- 旧 rubrics/rubric_items の撤去
-- =========================================================================

-- exercise_case_rubrics / rubric_reference_knowledge は旧 rubrics(id) を参照しているため、
-- 差し替え前に内容をクリアして FK 制約を外す。
truncate table exercise_case_rubrics;
alter table exercise_case_rubrics drop constraint if exists exercise_case_rubrics_rubric_id_fkey;

truncate table rubric_reference_knowledge;
alter table rubric_reference_knowledge drop constraint if exists rubric_reference_knowledge_rubric_id_fkey;

drop table if exists rubric_items;
drop table if exists rubrics;
drop type if exists rubric_review_status;
drop type if exists rubric_target_type;

-- =========================================================================
-- Knowledge Base 層（knowledge_base / knowledge_item / rubric / rubric_level /
-- prompt_template）
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

-- exercise_case_rubrics / rubric_reference_knowledge を新しい rubric(id) へ再接続する。
alter table exercise_case_rubrics
  add constraint exercise_case_rubrics_rubric_id_fkey
  foreign key (rubric_id) references rubric (id);

alter table rubric_reference_knowledge
  add constraint rubric_reference_knowledge_rubric_id_fkey
  foreign key (rubric_id) references rubric (id);
