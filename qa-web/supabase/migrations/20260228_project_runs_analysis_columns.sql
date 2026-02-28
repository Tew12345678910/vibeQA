ALTER TABLE IF EXISTS public.project_runs
  ADD COLUMN IF NOT EXISTS analysis_framework text,
  ADD COLUMN IF NOT EXISTS analysis_router text,
  ADD COLUMN IF NOT EXISTS analysis_routes_json jsonb NOT NULL DEFAULT '[]'::jsonb;
