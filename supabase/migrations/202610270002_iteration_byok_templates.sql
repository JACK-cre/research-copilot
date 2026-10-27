create extension if not exists pg_trgm with schema extensions;

alter table public.research_runs
  add column if not exists parent_run_id uuid references public.research_runs(id) on delete set null,
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists revision_instruction text,
  add column if not exists revision_target text check (revision_target in ('all', 'report', 'slides')),
  add column if not exists ai_source text not null default 'platform' check (ai_source in ('personal', 'platform', 'local')),
  add column if not exists template_snapshot jsonb;

create index if not exists research_runs_parent_idx
  on public.research_runs (parent_run_id, version desc);

create index if not exists document_chunks_content_trgm_idx
  on public.document_chunks using gin (content extensions.gin_trgm_ops);

create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_api_key text not null,
  base_url text not null default 'https://api.openai.com/v1',
  chat_model text not null default 'gpt-4.1-mini',
  embedding_model text not null default 'text-embedding-3-small',
  embedding_dimensions integer not null default 384 check (embedding_dimensions = 384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.output_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  kind text not null check (kind in ('report', 'presentation', 'both')),
  description text not null default '' check (char_length(description) <= 300),
  school text not null default '' check (char_length(school) <= 120),
  citation_style text not null default 'GB/T 7714-2015' check (char_length(citation_style) <= 80),
  instructions text not null check (char_length(instructions) between 10 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists output_templates_workspace_idx
  on public.output_templates (workspace_id, created_at desc);

drop trigger if exists user_ai_settings_set_updated_at on public.user_ai_settings;
create trigger user_ai_settings_set_updated_at before update on public.user_ai_settings
for each row execute function public.set_updated_at();

drop trigger if exists output_templates_set_updated_at on public.output_templates;
create trigger output_templates_set_updated_at before update on public.output_templates
for each row execute function public.set_updated_at();

alter table public.user_ai_settings enable row level security;
alter table public.output_templates enable row level security;

drop policy if exists "ai_settings_read_own" on public.user_ai_settings;
drop policy if exists "templates_read_member" on public.output_templates;
create policy "ai_settings_read_own" on public.user_ai_settings
  for select using (user_id = auth.uid());
create policy "templates_read_member" on public.output_templates
  for select using (public.is_workspace_member(workspace_id));

revoke all on public.user_ai_settings, public.output_templates from anon, authenticated;
grant select on public.output_templates to authenticated;
