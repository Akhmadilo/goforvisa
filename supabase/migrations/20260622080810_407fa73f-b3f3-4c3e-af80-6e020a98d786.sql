
-- Two-stage approvals: CEO first (Telegram), then Admin (platform)

-- Leaves: add CEO-stage fields
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS ceo_status text NOT NULL DEFAULT 'pending'
    CHECK (ceo_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS ceo_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS ceo_decided_by_tg bigint,
  ADD COLUMN IF NOT EXISTS ceo_note text,
  ADD COLUMN IF NOT EXISTS proposed_salary_counts boolean;

-- Backfill: existing approved/rejected rows: ceo_status mirrors final status
UPDATE public.leave_requests
SET ceo_status = CASE WHEN status::text IN ('approved','rejected') THEN status::text ELSE 'pending' END
WHERE ceo_status = 'pending' AND status::text <> 'pending';

-- Advances: notif messages for CEO Telegram cards (to edit after decision)
ALTER TABLE public.advance_requests
  ADD COLUMN IF NOT EXISTS notif_messages jsonb;
