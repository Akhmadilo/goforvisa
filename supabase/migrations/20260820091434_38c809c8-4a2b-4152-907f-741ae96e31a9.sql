CREATE TABLE public.call_centre_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT public.tenant_default() REFERENCES public.tenants(id) ON DELETE CASCADE,
  min_count integer NOT NULL,
  max_count integer,
  base_uzs numeric NOT NULL DEFAULT 0,
  kpi_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_centre_tiers TO authenticated;
GRANT ALL ON public.call_centre_tiers TO service_role;

ALTER TABLE public.call_centre_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc tiers tenant isolation" ON public.call_centre_tiers
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "cc tiers readable by kpi/salary viewers" ON public.call_centre_tiers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid()
        AND wp.widget_key IN ('kpi_section', 'salaries_section')
    )
  );

CREATE POLICY "cc tiers managed by admin" ON public.call_centre_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER call_centre_tiers_touch
  BEFORE UPDATE ON public.call_centre_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.call_centre_tiers (tenant_id, min_count, max_count, base_uzs, kpi_pct)
SELECT t.id, v.min_count, v.max_count, v.base_uzs, v.kpi_pct
FROM public.tenants t
CROSS JOIN (VALUES
  (1, 4, 1000000, 0),
  (5, 9, 1500000, 0),
  (10, 14, 2000000, 5),
  (15, 19, 2500000, 10),
  (20, 24, 3000000, 15),
  (25, 29, 3500000, 20),
  (30, NULL::integer, 4000000, 25)
) AS v(min_count, max_count, base_uzs, kpi_pct);