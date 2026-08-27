ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS employee_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS welcome_text text;