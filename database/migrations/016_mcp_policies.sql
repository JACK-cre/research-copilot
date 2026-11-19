CREATE TABLE IF NOT EXISTS public.workspace_mcp_policies (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  allowed_tools text[] NOT NULL DEFAULT ARRAY['search_papers','search_sources','search_knowledge','list_library','search_arxiv','fetch_url'],
  denied_tools text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_domains text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_calls integer NOT NULL DEFAULT 120 CHECK (max_calls BETWEEN 1 AND 1000),
  tool_timeout_ms integer NOT NULL DEFAULT 120000 CHECK (tool_timeout_ms BETWEEN 1000 AND 300000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
