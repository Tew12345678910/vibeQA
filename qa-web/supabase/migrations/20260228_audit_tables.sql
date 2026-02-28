CREATE TABLE IF NOT EXISTS public.audit_runs (
  id text PRIMARY KEY,
  base_url text NOT NULL,
  input_json jsonb NOT NULL,
  status text NOT NULL,
  external_run_id text,
  summary_json jsonb,
  progress_json jsonb,
  error text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  started_at bigint,
  finished_at bigint,
  last_synced_at bigint
);

CREATE TABLE IF NOT EXISTS public.audit_page_results (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL REFERENCES public.audit_runs(id) ON DELETE CASCADE,
  route text NOT NULL,
  viewport_key text NOT NULL,
  status text NOT NULL,
  result_json jsonb NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  UNIQUE(audit_id, route, viewport_key)
);

CREATE TABLE IF NOT EXISTS public.audit_issues (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL REFERENCES public.audit_runs(id) ON DELETE CASCADE,
  severity text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  issue_json jsonb NOT NULL,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_artifacts (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL REFERENCES public.audit_runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  url text NOT NULL,
  meta_json jsonb NOT NULL,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_runs_status_created_idx ON public.audit_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_runs_base_url_idx ON public.audit_runs(base_url);
CREATE INDEX IF NOT EXISTS audit_page_results_audit_idx ON public.audit_page_results(audit_id);
CREATE INDEX IF NOT EXISTS audit_issues_audit_idx ON public.audit_issues(audit_id);
CREATE INDEX IF NOT EXISTS audit_artifacts_audit_idx ON public.audit_artifacts(audit_id);
