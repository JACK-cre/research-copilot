CREATE TABLE IF NOT EXISTS public.research_jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.research_runs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('research', 'refine')),
  payload jsonb NOT NULL,
  template_snapshot jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  stage text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error text,
  worker_token text,
  heartbeat_at timestamptz,
  max_runtime_seconds integer NOT NULL DEFAULT 1800,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS research_jobs_workspace_created_idx
  ON public.research_jobs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_jobs_status_created_idx
  ON public.research_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS research_jobs_heartbeat_idx
  ON public.research_jobs (status, heartbeat_at);

DROP TRIGGER IF EXISTS research_jobs_set_updated_at ON public.research_jobs;
CREATE TRIGGER research_jobs_set_updated_at
BEFORE UPDATE ON public.research_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
