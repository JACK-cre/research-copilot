ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS parent_content text;
