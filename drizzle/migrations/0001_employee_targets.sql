CREATE TABLE public.employee_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  contracts_target integer NOT NULL DEFAULT 0 CHECK (contracts_target >= 0),
  docs_target integer NOT NULL DEFAULT 0 CHECK (docs_target >= 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_targets TO authenticated;
GRANT ALL ON public.employee_targets TO service_role;
ALTER TABLE public.employee_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant isolation" ON public.employee_targets AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Targets viewable by kpi users" ON public.employee_targets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'kpi_section'));
CREATE POLICY "Targets insert by admin" ON public.employee_targets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Targets update by admin" ON public.employee_targets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Targets delete by admin" ON public.employee_targets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER employee_targets_touch BEFORE UPDATE ON public.employee_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();