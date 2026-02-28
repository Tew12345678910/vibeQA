-- Add owner column to projects so rows are scoped per user.
-- Existing rows get NULL; the application filters them out.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS user_id text;

CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects(user_id);
