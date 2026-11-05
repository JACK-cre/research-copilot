DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.output_templates'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.output_templates DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.output_templates
  ADD COLUMN IF NOT EXISTS paper_source_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS paper_storage_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS slides_source_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS slides_storage_path text NOT NULL DEFAULT '';

ALTER TABLE public.output_templates
  ADD CONSTRAINT output_templates_kind_check CHECK (kind IN ('report', 'presentation', 'both')),
  ADD CONSTRAINT output_templates_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  ADD CONSTRAINT output_templates_description_len CHECK (char_length(description) <= 4000),
  ADD CONSTRAINT output_templates_instructions_len CHECK (char_length(instructions) BETWEEN 8 AND 100000);

ALTER TABLE public.study_conversations
  ADD COLUMN IF NOT EXISTS memory_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS memory_summary_message_count integer NOT NULL DEFAULT 0;
