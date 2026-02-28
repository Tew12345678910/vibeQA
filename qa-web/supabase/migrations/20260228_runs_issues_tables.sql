CREATE TABLE IF NOT EXISTS public.project_runs (
  id          text        PRIMARY KEY,
  project_id  text        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  count_p0    int         NOT NULL DEFAULT 0,
  count_p1    int         NOT NULL DEFAULT 0,
  count_p2    int         NOT NULL DEFAULT 0,
  count_total int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.run_issues (
  id          bigserial   PRIMARY KEY,
  run_id      text        NOT NULL REFERENCES public.project_runs(id) ON DELETE CASCADE,
  project_id  text        NOT NULL,
  issue_id    text        NOT NULL,
  source      text        NOT NULL,
  title       text        NOT NULL,
  priority    text        NOT NULL,
  category    text        NOT NULL,
  description text,
  UNIQUE (run_id, issue_id)
);

CREATE INDEX IF NOT EXISTS project_runs_project_id_idx ON public.project_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS run_issues_run_id_idx       ON public.run_issues(run_id);
