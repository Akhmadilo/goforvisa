
-- Tighten INSERT policy on expense_categories to match UPDATE/DELETE posture
DROP POLICY IF EXISTS "Categories insertable by permitted users" ON public.expense_categories;
CREATE POLICY "Categories insertable by admins or creators"
ON public.expense_categories
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.widget_permissions wp
    WHERE wp.user_id = auth.uid()
      AND wp.widget_key = 'expenses_create'
  )
);

-- Add dedicated channel topic gate for expense_payments realtime broadcasts
DROP POLICY IF EXISTS "expense_payments realtime gated by expenses_section" ON realtime.messages;
CREATE POLICY "expense_payments realtime gated by expenses_section"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() = 'expense-payments-realtime')
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid()
        AND wp.widget_key = 'expenses_section'
    )
  )
);
