create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists public.app_users (
  id uuid primary key,
  email text not null unique check (char_length(email) between 3 and 254),
  password_hash text not null,
  display_name text not null default '' check (char_length(display_name) <= 80),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_idx
  on public.auth_sessions (user_id, expires_at desc);
create index if not exists auth_sessions_expiry_idx
  on public.auth_sessions (expires_at);

create table if not exists public.password_reset_tokens (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_idx
  on public.password_reset_tokens (user_id, expires_at desc);

create table if not exists public.auth_attempts (
  id bigserial primary key,
  key_hash text not null check (char_length(key_hash) = 64),
  action text not null check (action in ('login', 'register', 'reset')),
  created_at timestamptz not null default now()
);

create index if not exists auth_attempts_lookup_idx
  on public.auth_attempts (key_hash, action, created_at desc);

create table if not exists public.workspaces (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id, created_at);

create table if not exists public.documents (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references public.app_users(id) on delete restrict,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  storage_path text not null,
  sha256 text not null check (char_length(sha256) = 64),
  embedding_model text not null,
  embedding_dimensions integer not null default 384 check (embedding_dimensions = 384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_workspace_created_idx
  on public.documents (workspace_id, created_at desc);
create index if not exists documents_workspace_sha_idx
  on public.documents (workspace_id, sha256);

create table if not exists public.document_chunks (
  id text primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_name text not null,
  content text not null,
  page integer,
  embedding vector(384) not null,
  created_at timestamptz not null default now()
);

create index if not exists document_chunks_workspace_idx
  on public.document_chunks (workspace_id, document_id);
create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists document_chunks_content_trgm_idx
  on public.document_chunks using gin (content gin_trgm_ops);

create table if not exists public.research_runs (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.app_users(id) on delete restrict,
  topic text not null,
  requirements text not null default '',
  status text not null check (status in ('running', 'completed', 'failed')),
  request jsonb not null,
  result jsonb,
  error text,
  parent_run_id uuid references public.research_runs(id) on delete set null,
  version integer not null default 1 check (version > 0),
  revision_instruction text,
  revision_target text check (revision_target in ('all', 'report', 'slides')),
  ai_source text not null default 'platform' check (ai_source in ('personal', 'platform', 'local')),
  template_snapshot jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists research_runs_workspace_created_idx
  on public.research_runs (workspace_id, created_at desc);
create index if not exists research_runs_parent_idx
  on public.research_runs (parent_run_id, version desc);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  created_by uuid not null references public.app_users(id) on delete restrict,
  type text not null check (type in ('markdown', 'pptx')),
  file_name text not null,
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists artifacts_run_idx
  on public.artifacts (run_id, created_at desc);

create table if not exists public.user_ai_settings (
  user_id uuid primary key references public.app_users(id) on delete cascade,
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
  created_by uuid not null references public.app_users(id) on delete cascade,
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at before update on public.app_users
for each row execute function public.set_updated_at();
drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at before update on public.workspaces
for each row execute function public.set_updated_at();
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();
drop trigger if exists user_ai_settings_set_updated_at on public.user_ai_settings;
create trigger user_ai_settings_set_updated_at before update on public.user_ai_settings
for each row execute function public.set_updated_at();
drop trigger if exists output_templates_set_updated_at on public.output_templates;
create trigger output_templates_set_updated_at before update on public.output_templates
for each row execute function public.set_updated_at();
