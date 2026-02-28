ALTER TABLE IF EXISTS public.rules
  ADD COLUMN IF NOT EXISTS targets text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS signals text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS skill_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS version text NOT NULL DEFAULT 'rule-spec/v1',
  ADD COLUMN IF NOT EXISTS lesson_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS rules_targets_gin_idx
ON public.rules USING gin (targets);

CREATE INDEX IF NOT EXISTS rules_signals_gin_idx
ON public.rules USING gin (signals);

CREATE INDEX IF NOT EXISTS rules_skill_tags_gin_idx
ON public.rules USING gin (skill_tags);

CREATE INDEX IF NOT EXISTS rules_version_idx
ON public.rules(version);

CREATE INDEX IF NOT EXISTS rules_lesson_enabled_idx
ON public.rules(lesson_enabled);

UPDATE public.rules
SET contents =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(COALESCE(contents, '{}'::jsonb), '{targets}', to_jsonb(targets), true),
          '{signals}',
          to_jsonb(signals),
          true
        ),
        '{skill_tags}',
        to_jsonb(skill_tags),
        true
      ),
      '{version}',
      to_jsonb(version),
      true
    ),
    '{lesson_enabled}',
    to_jsonb(lesson_enabled),
    true
  );

UPDATE public.rules
SET contents = jsonb_set(
  contents,
  '{education}',
  jsonb_build_object(
    'why_it_matters',
    COALESCE(NULLIF(description, ''), 'This rule reduces security and reliability regressions in production.'),
    'rule_of_thumb',
    'Treat this rule as a required default behavior, not an optional guideline.',
    'common_pitfalls',
    jsonb_build_array(
      'Applying fixes in one endpoint while similar routes remain inconsistent.',
      'Relying on manual review without regression tests.',
      'Leaving rule contracts undocumented in shared code.'
    )
  ),
  true
)
WHERE NOT (contents ? 'education');

UPDATE public.rules
SET contents = jsonb_set(
  contents,
  '{remediation}',
  jsonb_build_object(
    'recommended_pattern',
    'Implement a shared, test-covered pattern for this rule and enforce it across all targets.',
    'implementation_steps',
    jsonb_build_array(
      'Identify all in-scope files and current rule violations.',
      'Implement or reuse a shared abstraction that enforces the rule.',
      'Add positive and negative regression tests.',
      'Verify no violations remain in scanner output.'
    ),
    'acceptance_criteria',
    jsonb_build_array(
      'Rule pass criteria is met across all in-scope files.',
      'Rule fail criteria no longer reproduces.',
      'Automated checks prevent reintroduction of the issue.'
    )
  ),
  true
)
WHERE NOT (contents ? 'remediation');
