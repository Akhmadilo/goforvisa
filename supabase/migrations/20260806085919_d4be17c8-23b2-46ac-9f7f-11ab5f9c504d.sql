-- 1) employee_base_salaries: restrict reads
DROP POLICY IF EXISTS "Base salaries readable by authenticated" ON public.employee_base_salaries;
CREATE POLICY "Base salaries readable by salary viewers"
ON public.employee_base_salaries
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_section'
  )
);

-- 2) advance_requests: split the single broad UPDATE policy into role-scoped policies
DROP POLICY IF EXISTS "Admin CEO Finance can update advance_requests" ON public.advance_requests;

CREATE POLICY "Admin can update advance_requests"
ON public.advance_requests
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- CEO may only act on requests awaiting the CEO step; may not write finance-step fields
CREATE POLICY "CEO can decide advance_requests"
ON public.advance_requests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'owner_ceo'::app_role)
  AND status = 'pending'
)
WITH CHECK (
  has_role(auth.uid(), 'owner_ceo'::app_role)
  AND finance_approved_by IS NULL
  AND finance_approved_at IS NULL
  AND finance_note IS NULL
  AND paid_at IS NULL
  AND paid_by IS NULL
  AND deducted_in_salary_id IS NULL
);

-- Financier may only act after the CEO step and may never author the CEO decision
CREATE POLICY "Financier can process approved advance_requests"
ON public.advance_requests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'financier'::app_role)
  AND status IN ('ceo_approved', 'approved')
  AND ceo_approved_at IS NOT NULL
)
WITH CHECK (
  has_role(auth.uid(), 'financier'::app_role)
  AND ceo_approved_at IS NOT NULL
  AND ceo_approved_by IS DISTINCT FROM auth.uid()
);

-- 3) leave_requests: financier may not touch CEO decision fields
DROP POLICY IF EXISTS "financier update pending leaves" ON public.leave_requests;
CREATE POLICY "financier update pending leaves"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'financier'::app_role)
  AND status = 'pending'::leave_status
)
WITH CHECK (
  has_role(auth.uid(), 'financier'::app_role)
  AND status = 'pending'::leave_status
  AND ceo_status = 'pending'
  AND ceo_decided_at IS NULL
  AND ceo_decided_by_tg IS NULL
  AND ceo_note IS NULL
);