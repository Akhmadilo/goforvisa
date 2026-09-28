ALTER TABLE public.daily_cash_reports ADD COLUMN IF NOT EXISTS receiver text NOT NULL DEFAULT '';
ALTER TABLE public.daily_cash_reports DROP CONSTRAINT IF EXISTS daily_cash_reports_chat_id_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS daily_cash_reports_chat_date_receiver_key ON public.daily_cash_reports (chat_id, date, receiver);