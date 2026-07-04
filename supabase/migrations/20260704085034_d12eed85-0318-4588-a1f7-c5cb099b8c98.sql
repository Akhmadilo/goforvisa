DROP POLICY IF EXISTS "Authenticated can read salary payments" ON public.salary_payments;
CREATE POLICY "Salary payments read scoped" ON public.salary_payments
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.widget_permissions
    WHERE user_id = auth.uid()
      AND widget_key IN ('salaries_section','salaries_table','salaries_edit','salaries_create','salaries_totals','salaries_pivot')
  )
);

DROP POLICY IF EXISTS "approvals readable by authenticated" ON public.sales_kpi_approvals;
CREATE POLICY "Sales KPI approvals read scoped" ON public.sales_kpi_approvals
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.widget_permissions
    WHERE user_id = auth.uid()
      AND widget_key IN ('kpi_section','kpi','salaries_section','salaries_edit','salaries_create')
  )
);

DROP POLICY IF EXISTS "rates readable by authenticated" ON public.sales_kpi_rates;
CREATE POLICY "Sales KPI rates read scoped" ON public.sales_kpi_rates
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.widget_permissions
    WHERE user_id = auth.uid()
      AND widget_key IN ('kpi_section','kpi','salaries_section','salaries_edit','salaries_create')
  )
);