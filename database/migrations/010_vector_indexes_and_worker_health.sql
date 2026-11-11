-- Restore a usable vector index without forcing every provider to share one
-- fixed dimension. pgvector expression indexes are dimension-specific, so the
-- application's current embedding dimensions are indexed explicitly.
-- pgvector HNSW supports up to 2000 dimensions for the vector type, so
-- larger vectors fall back to exact search until migrated to halfvec.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_256_hnsw_idx
  ON public.document_chunks
  USING hnsw ((embedding::vector(256)) vector_cosine_ops)
  WHERE vector_dims(embedding) = 256;

CREATE INDEX IF NOT EXISTS document_chunks_embedding_384_hnsw_idx
  ON public.document_chunks
  USING hnsw ((embedding::vector(384)) vector_cosine_ops)
  WHERE vector_dims(embedding) = 384;

CREATE INDEX IF NOT EXISTS document_chunks_embedding_768_hnsw_idx
  ON public.document_chunks
  USING hnsw ((embedding::vector(768)) vector_cosine_ops)
  WHERE vector_dims(embedding) = 768;

CREATE INDEX IF NOT EXISTS document_chunks_embedding_512_hnsw_idx
  ON public.document_chunks
  USING hnsw ((embedding::vector(512)) vector_cosine_ops)
  WHERE vector_dims(embedding) = 512;

CREATE INDEX IF NOT EXISTS document_chunks_embedding_1024_hnsw_idx
  ON public.document_chunks
  USING hnsw ((embedding::vector(1024)) vector_cosine_ops)
  WHERE vector_dims(embedding) = 1024;

CREATE INDEX IF NOT EXISTS document_chunks_embedding_1536_hnsw_idx
  ON public.document_chunks
  USING hnsw ((embedding::vector(1536)) vector_cosine_ops)
  WHERE vector_dims(embedding) = 1536;


ALTER TABLE public.document_ingestion_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_runtime_seconds integer NOT NULL DEFAULT 3600;

CREATE INDEX IF NOT EXISTS document_ingestion_jobs_heartbeat_idx
  ON public.document_ingestion_jobs (status, heartbeat_at);
