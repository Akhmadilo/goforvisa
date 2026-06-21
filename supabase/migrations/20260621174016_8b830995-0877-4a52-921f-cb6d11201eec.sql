-- Add bot_role to employee_telegram for bot-specific roles (Director / Finance)
DO $$ BEGIN
  CREATE TYPE public.telegram_bot_role AS ENUM ('none','director','finance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employee_telegram
  ADD COLUMN IF NOT EXISTS bot_role public.telegram_bot_role NOT NULL DEFAULT 'none';