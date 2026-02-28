-- Drop legacy audit tables (superseded by project_runs + run_issues)
DROP TABLE IF EXISTS public.audit_artifacts CASCADE;
DROP TABLE IF EXISTS public.audit_issues CASCADE;
DROP TABLE IF EXISTS public.audit_page_results CASCADE;
DROP TABLE IF EXISTS public.audit_runs CASCADE;
