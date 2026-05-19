DROP POLICY IF EXISTS "Expenses insertable by permitted users" ON public.expenses;
DROP POLICY IF EXISTS "Expenses updatable by permitted users" ON public.expenses;
DROP POLICY IF EXISTS "Expenses deletable by permitted users" ON public.expenses;
DROP POLICY IF EXISTS "Expense payments insertable by permitted users" ON public.expense_payments;
DROP POLICY IF EXISTS "Expense payments updatable by permitted users" ON public.expense_payments;
DROP POLICY IF EXISTS "Expense payments deletable by permitted users" ON public.expense_payments;

CREATE POLICY "Expenses insertable by creators"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_create')
);

CREATE POLICY "Expenses updatable by creators"
ON public.expenses FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_create')
);

CREATE POLICY "Expenses deletable by creators"
ON public.expenses FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_create')
);

CREATE POLICY "Expense payments insertable by creators"
ON public.expense_payments FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_create')
);

CREATE POLICY "Expense payments updatable by creators"
ON public.expense_payments FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_create')
);

CREATE POLICY "Expense payments deletable by creators"
ON public.expense_payments FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_create')
);