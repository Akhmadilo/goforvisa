
-- 1) Employees table
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  position text,
  avatar_url text,
  hired_at date,
  terminated_at date,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER employees_touch_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees viewable by permitted users"
ON public.employees FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_section')
);

CREATE POLICY "Employees insertable by creators"
ON public.employees FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
);

CREATE POLICY "Employees updatable by creators"
ON public.employees FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
);

CREATE POLICY "Employees deletable by creators"
ON public.employees FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
);

-- 2) Storage bucket for employee photos
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-photos', 'employee-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Employee photos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'employee-photos');

CREATE POLICY "Employee photos uploadable by permitted users"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
  )
);

CREATE POLICY "Employee photos updatable by permitted users"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
  )
);

CREATE POLICY "Employee photos deletable by permitted users"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
  )
);

-- 3) Restructure expense RLS: split create / edit / delete / pay
DROP POLICY IF EXISTS "Expenses updatable by creators" ON public.expenses;
DROP POLICY IF EXISTS "Expenses deletable by creators" ON public.expenses;

CREATE POLICY "Expenses updatable by editors"
ON public.expenses FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_edit')
);

CREATE POLICY "Expenses deletable by deleters"
ON public.expenses FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_delete')
);

-- Expense payments: separate expenses_pay widget for ALL mutations
DROP POLICY IF EXISTS "Expense payments insertable by creators" ON public.expense_payments;
DROP POLICY IF EXISTS "Expense payments updatable by creators" ON public.expense_payments;
DROP POLICY IF EXISTS "Expense payments deletable by creators" ON public.expense_payments;

CREATE POLICY "Expense payments insertable by payers"
ON public.expense_payments FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_pay')
);

CREATE POLICY "Expense payments updatable by payers"
ON public.expense_payments FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_pay')
);

CREATE POLICY "Expense payments deletable by payers"
ON public.expense_payments FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_pay')
);

-- 4) Same for salaries: split edit / delete
DROP POLICY IF EXISTS "Salaries updatable by creators" ON public.salaries;
DROP POLICY IF EXISTS "Salaries deletable by creators" ON public.salaries;

CREATE POLICY "Salaries updatable by editors"
ON public.salaries FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_edit')
);

CREATE POLICY "Salaries deletable by deleters"
ON public.salaries FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_delete')
);
