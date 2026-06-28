
CREATE TABLE public.sales_kpi_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_name text NOT NULL UNIQUE,
  rate_per_usd numeric NOT NULL DEFAULT 500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_kpi_rates TO authenticated;
GRANT ALL ON public.sales_kpi_rates TO service_role;
ALTER TABLE public.sales_kpi_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rates readable by authenticated" ON public.sales_kpi_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "rates manageable by admin" ON public.sales_kpi_rates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_sales_kpi_rates_touch BEFORE UPDATE ON public.sales_kpi_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.sales_kpi_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  manager_name text NOT NULL,
  approved_year int NOT NULL,
  approved_month int NOT NULL,
  bonus_uzs numeric NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_kpi_approvals TO authenticated;
GRANT ALL ON public.sales_kpi_approvals TO service_role;
ALTER TABLE public.sales_kpi_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approvals readable by authenticated" ON public.sales_kpi_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "approvals manageable by admin" ON public.sales_kpi_approvals FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
