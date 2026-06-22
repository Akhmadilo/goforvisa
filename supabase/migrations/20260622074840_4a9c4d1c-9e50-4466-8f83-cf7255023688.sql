ALTER TABLE public.fine_rules
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'late';
ALTER TABLE public.fine_rules
  DROP CONSTRAINT IF EXISTS fine_rules_kind_check;
ALTER TABLE public.fine_rules
  ADD CONSTRAINT fine_rules_kind_check CHECK (kind IN ('late','absence'));
ALTER TABLE public.fine_rules ALTER COLUMN min_minutes DROP NOT NULL;