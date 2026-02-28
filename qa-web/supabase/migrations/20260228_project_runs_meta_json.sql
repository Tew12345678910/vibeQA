ALTER TABLE IF EXISTS public.project_runs
  ADD COLUMN IF NOT EXISTS meta_json jsonb NOT NULL DEFAULT '{}'::jsonb;
