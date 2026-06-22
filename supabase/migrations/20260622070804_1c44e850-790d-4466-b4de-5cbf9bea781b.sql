ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS telegram_id bigint,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'panel';

CREATE INDEX IF NOT EXISTS idx_leave_requests_tg ON public.leave_requests(telegram_id);

-- Allow ishchi (telegram bot via service role) to create requests through edge; but inserts go via service_role anyway.
-- Add policy: ishchi can read own request - skip, only via bot.

-- Track director chat notification message id for editing later
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS notif_messages jsonb NOT NULL DEFAULT '[]'::jsonb;