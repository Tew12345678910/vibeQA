CREATE TABLE IF NOT EXISTS public.projects (
  id          text        PRIMARY KEY,
  name        text        NOT NULL,
  source_type text        NOT NULL DEFAULT 'local',
  github_repo text,
  website_url text,
  base_url    text        NOT NULL DEFAULT '',
  config_json jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_created_at_idx ON public.projects(created_at DESC);
