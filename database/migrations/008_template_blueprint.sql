ALTER TABLE public.output_templates
  ADD COLUMN IF NOT EXISTS blueprint jsonb;

COMMENT ON COLUMN public.output_templates.blueprint IS
  'Structured, editable report/slides template blueprint. instructions remains the generated prompt representation.';
