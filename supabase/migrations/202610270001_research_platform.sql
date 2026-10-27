create extension if not exists vector with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_admin(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

create table if not exists public.documents (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete restrict,
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
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now()
);

create index if not exists document_chunks_workspace_idx
  on public.document_chunks (workspace_id, document_id);
create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists public.research_runs (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  topic text not null,
  requirements text not null default '',
  status text not null check (status in ('running', 'completed', 'failed')),
  request jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists research_runs_workspace_created_idx
  on public.research_runs (workspace_id, created_at desc);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  type text not null check (type in ('markdown', 'pptx')),
  file_name text not null,
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists artifacts_run_idx on public.artifacts (run_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at before update on public.workspaces
for each row execute function public.set_updated_at();
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();

create or replace function public.provision_user_workspace(
  target_user uuid,
  target_email text,
  target_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (target_user, coalesce(target_email, ''), coalesce(target_name, ''))
  on conflict (id) do update set email = excluded.email;

  select workspace_id into workspace
  from public.workspace_members
  where user_id = target_user
  order by created_at asc
  limit 1;

  if workspace is null then
    insert into public.workspaces (name, owner_id)
    values ('我的研究空间', target_user)
    returning id into workspace;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (workspace, target_user, 'owner');
  end if;

  return workspace;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.provision_user_workspace(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

revoke all on function public.provision_user_workspace(uuid, text, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

do $$
declare
  account record;
begin
  for account in
    select id, email, coalesce(raw_user_meta_data ->> 'full_name', '') as display_name
    from auth.users
  loop
    perform public.provision_user_workspace(account.id, account.email, account.display_name);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.research_runs enable row level security;
alter table public.artifacts enable row level security;

drop policy if exists "profiles_read_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_read_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "workspaces_read_member" on public.workspaces;
drop policy if exists "workspaces_update_admin" on public.workspaces;
create policy "workspaces_read_member" on public.workspaces for select using (public.is_workspace_member(id));
create policy "workspaces_update_admin" on public.workspaces for update using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

drop policy if exists "members_read_member" on public.workspace_members;
drop policy if exists "members_insert_admin" on public.workspace_members;
drop policy if exists "members_update_admin" on public.workspace_members;
drop policy if exists "members_delete_admin" on public.workspace_members;
create policy "members_read_member" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy "members_insert_admin" on public.workspace_members for insert with check (public.is_workspace_admin(workspace_id));
create policy "members_update_admin" on public.workspace_members for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "members_delete_admin" on public.workspace_members for delete using (public.is_workspace_admin(workspace_id) and user_id <> auth.uid());

drop policy if exists "documents_read_member" on public.documents;
drop policy if exists "documents_insert_member" on public.documents;
drop policy if exists "documents_update_member" on public.documents;
drop policy if exists "documents_delete_member" on public.documents;
create policy "documents_read_member" on public.documents for select using (public.is_workspace_member(workspace_id));
create policy "documents_insert_member" on public.documents for insert with check (public.is_workspace_member(workspace_id) and owner_id = auth.uid());
create policy "documents_update_member" on public.documents for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "documents_delete_member" on public.documents for delete using (public.is_workspace_member(workspace_id));

drop policy if exists "chunks_read_member" on public.document_chunks;
drop policy if exists "chunks_insert_member" on public.document_chunks;
drop policy if exists "chunks_update_member" on public.document_chunks;
drop policy if exists "chunks_delete_member" on public.document_chunks;
create policy "chunks_read_member" on public.document_chunks for select using (public.is_workspace_member(workspace_id));
create policy "chunks_insert_member" on public.document_chunks for insert with check (public.is_workspace_member(workspace_id));
create policy "chunks_update_member" on public.document_chunks for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "chunks_delete_member" on public.document_chunks for delete using (public.is_workspace_member(workspace_id));

drop policy if exists "runs_read_member" on public.research_runs;
drop policy if exists "runs_insert_member" on public.research_runs;
drop policy if exists "runs_update_member" on public.research_runs;
drop policy if exists "runs_delete_member" on public.research_runs;
create policy "runs_read_member" on public.research_runs for select using (public.is_workspace_member(workspace_id));
create policy "runs_insert_member" on public.research_runs for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "runs_update_member" on public.research_runs for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "runs_delete_member" on public.research_runs for delete using (public.is_workspace_member(workspace_id));

drop policy if exists "artifacts_read_member" on public.artifacts;
drop policy if exists "artifacts_insert_member" on public.artifacts;
drop policy if exists "artifacts_delete_member" on public.artifacts;
create policy "artifacts_read_member" on public.artifacts for select using (public.is_workspace_member(workspace_id));
create policy "artifacts_insert_member" on public.artifacts for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "artifacts_delete_member" on public.artifacts for delete using (public.is_workspace_member(workspace_id));

revoke all on public.profiles, public.workspaces, public.workspace_members, public.documents,
  public.document_chunks, public.research_runs, public.artifacts from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members, public.documents,
  public.document_chunks, public.research_runs, public.artifacts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-files',
  'research-files',
  false,
  15728640,
  array['application/pdf', 'text/plain', 'text/markdown', 'application/octet-stream', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "storage_read_workspace" on storage.objects;
drop policy if exists "storage_insert_workspace" on storage.objects;
drop policy if exists "storage_delete_workspace" on storage.objects;
create policy "storage_read_workspace" on storage.objects for select to authenticated
using (
  bucket_id = 'research-files'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);
