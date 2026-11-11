CREATE TABLE IF NOT EXISTS public.document_ingestion_jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'cancelled')),
  stage text NOT NULL DEFAULT 'queued'
    CHECK (stage IN ('queued', 'reading', 'extracting', 'vectorizing', 'saving', 'ready', 'failed')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  error text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  worker_token text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_ingestion_jobs_workspace_created_idx
  ON public.document_ingestion_jobs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_ingestion_jobs_status_created_idx
  ON public.document_ingestion_jobs (status, created_at);

DROP TRIGGER IF EXISTS document_ingestion_jobs_set_updated_at ON public.document_ingestion_jobs;
CREATE TRIGGER document_ingestion_jobs_set_updated_at
BEFORE UPDATE ON public.document_ingestion_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
