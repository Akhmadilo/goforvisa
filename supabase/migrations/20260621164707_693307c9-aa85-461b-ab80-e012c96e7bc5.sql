
-- 1) salaries.advance_amount
ALTER TABLE public.salaries
  ADD COLUMN IF NOT EXISTS advance_amount numeric NOT NULL DEFAULT 0;

-- 2) employee_telegram.bot_state
ALTER TABLE public.employee_telegram
  ADD COLUMN IF NOT EXISTS bot_state jsonb;

-- 3) advance_requests table
CREATE TABLE IF NOT EXISTS public.advance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  telegram_id bigint,
  amount_uzs numeric NOT NULL CHECK (amount_uzs > 0),
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ceo_approved','approved','paid','rejected','cancelled')),
  ceo_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ceo_approved_at timestamptz,
  ceo_note text,
  finance_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finance_approved_at timestamptz,
  finance_note text,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_reason text,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deducted_in_salary_id uuid REFERENCES public.salaries(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'telegram',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_requests TO authenticated;
GRANT ALL ON public.advance_requests TO service_role;

ALTER TABLE public.advance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view advance_requests"
ON public.advance_requests FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin CEO Finance can insert advance_requests"
ON public.advance_requests FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner_ceo')
  OR public.has_role(auth.uid(), 'financier')
);

CREATE POLICY "Admin CEO Finance can update advance_requests"
ON public.advance_requests FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner_ceo')
  OR public.has_role(auth.uid(), 'financier')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner_ceo')
  OR public.has_role(auth.uid(), 'financier')
);

CREATE POLICY "Admin can delete advance_requests"
ON public.advance_requests FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER advance_requests_touch_updated_at
BEFORE UPDATE ON public.advance_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_advance_requests_employee ON public.advance_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_advance_requests_status ON public.advance_requests(status);
CREATE INDEX IF NOT EXISTS idx_advance_requests_created ON public.advance_requests(created_at DESC);
