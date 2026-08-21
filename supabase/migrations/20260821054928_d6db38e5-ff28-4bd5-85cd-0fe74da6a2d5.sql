DROP POLICY IF EXISTS "cc tiers managed by admin" ON public.call_centre_tiers;
DROP POLICY IF EXISTS "cc tiers readable by kpi/salary viewers" ON public.call_centre_tiers;
DROP POLICY IF EXISTS "cc tiers tenant isolation" ON public.call_centre_tiers;

CREATE POLICY "cc tiers select same tenant"
ON public.call_centre_tiers FOR SELECT TO authenticated
USING (
  tenant_id = public.current_tenant_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid()
        AND wp.widget_key = ANY (ARRAY['kpi_section','salaries_section'])
    )
  )
);

CREATE POLICY "cc tiers admin write same tenant"
ON public.call_centre_tiers FOR ALL TO authenticated
USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role));