create table if not exists public.study_conversations (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.app_users(id) on delete restrict,
  title text not null default '新对话' check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_conversations_workspace_updated_idx
  on public.study_conversations (workspace_id, updated_at desc);

create table if not exists public.study_messages (
  id uuid primary key,
  conversation_id uuid not null references public.study_conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  tool_trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists study_messages_conversation_idx
  on public.study_messages (conversation_id, created_at);
