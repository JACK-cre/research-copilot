-- Historical embeddings remain searchable; only newly indexed material has provenance.
ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS chunk_index integer;
