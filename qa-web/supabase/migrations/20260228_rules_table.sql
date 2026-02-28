CREATE TABLE IF NOT EXISTS public.rules (
  id text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  priority text NOT NULL,
  description text NOT NULL,
  contents jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS rules_category_priority_idx ON public.rules(category, priority);
CREATE INDEX IF NOT EXISTS rules_enabled_idx ON public.rules(enabled);
