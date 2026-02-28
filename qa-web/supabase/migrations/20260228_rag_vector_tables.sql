CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.control_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id text NOT NULL,
  chunk_text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS control_chunks_control_id_uidx
ON public.control_chunks(control_id);

CREATE INDEX IF NOT EXISTS control_chunks_embedding_idx
ON public.control_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS control_chunks_control_id_idx
ON public.control_chunks(control_id);

CREATE TABLE IF NOT EXISTS public.code_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo text NOT NULL,
  commit_sha text NOT NULL,
  path text NOT NULL,
  line_start integer NOT NULL,
  line_end integer NOT NULL,
  chunk_text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx
ON public.code_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS code_chunks_repo_commit_idx
ON public.code_chunks(repo, commit_sha);

CREATE INDEX IF NOT EXISTS code_chunks_path_idx
ON public.code_chunks(path);

ALTER TABLE IF EXISTS public.run_issues
  ADD COLUMN IF NOT EXISTS card_json jsonb,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'open';

CREATE OR REPLACE FUNCTION public.match_control_chunks(
  query_embedding vector(1536),
  match_count integer DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  control_id text,
  chunk_text text,
  metadata jsonb,
  score double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    cc.id,
    cc.control_id,
    cc.chunk_text,
    cc.metadata,
    1 - (cc.embedding <=> query_embedding) AS score
  FROM public.control_chunks cc
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_code_chunks(
  query_embedding vector(1536),
  repo_filter text,
  commit_filter text,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  repo text,
  commit_sha text,
  path text,
  line_start integer,
  line_end integer,
  chunk_text text,
  metadata jsonb,
  score double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.repo,
    c.commit_sha,
    c.path,
    c.line_start,
    c.line_end,
    c.chunk_text,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS score
  FROM public.code_chunks c
  WHERE c.repo = repo_filter
    AND c.commit_sha = commit_filter
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
