DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_type_check') THEN
    ALTER TABLE public.artifacts DROP CONSTRAINT artifacts_type_check;
  END IF;
  ALTER TABLE public.artifacts ADD CONSTRAINT artifacts_type_check CHECK (type IN ('markdown', 'docx', 'pdf', 'pptx'));
END $$;
