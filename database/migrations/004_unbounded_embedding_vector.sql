DROP INDEX IF EXISTS public.document_chunks_embedding_hnsw_idx;
DROP TABLE IF EXISTS public.document_chunks;

CREATE TABLE public.document_chunks (
  id text primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_name text not null,
  content text not null,
  page integer,
  embedding vector not null,
  created_at timestamptz not null default now()
);

CREATE INDEX document_chunks_workspace_idx
  ON public.document_chunks (workspace_id, document_id);
CREATE INDEX document_chunks_content_trgm_idx
  ON public.document_chunks USING gin (content gin_trgm_ops);

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.documents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%embedding_dimensions%'
  LOOP
    EXECUTE format('ALTER TABLE public.documents DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_ai_settings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%embedding_dimensions%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_ai_settings DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.documents
  ALTER COLUMN embedding_dimensions SET DEFAULT 0,
  ADD CONSTRAINT documents_embedding_dimensions_check
    CHECK (embedding_dimensions BETWEEN 0 AND 4096);

ALTER TABLE public.user_ai_settings
  ALTER COLUMN embedding_dimensions SET DEFAULT 0,
  ADD CONSTRAINT user_ai_settings_embedding_dimensions_check
    CHECK (embedding_dimensions BETWEEN 0 AND 4096);

UPDATE public.documents
SET status = 'failed',
    chunk_count = 0;
