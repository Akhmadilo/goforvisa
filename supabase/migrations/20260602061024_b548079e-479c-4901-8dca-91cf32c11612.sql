
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year text,
  month text,
  client_name text NOT NULL,
  contract_no text,
  contract_date date,
  price_uzs numeric NOT NULL DEFAULT 0,
  price_usd numeric NOT NULL DEFAULT 0,
  docs_usd numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 0,
  payment text,
  people integer NOT NULL DEFAULT 1,
  note text,
  contract_type text,
  phone text,
  call_centre text,
  sales_manager text,
  back_office_manager text,
  company text,
  visa_result text,
  kpi_sales numeric NOT NULL DEFAULT 0,
  kpi_back_office numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  visa_fee numeric NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contracts viewable by permitted users"
ON public.contracts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_section')
);

CREATE POLICY "Contracts insertable by creators"
ON public.contracts FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_create')
);

CREATE POLICY "Contracts updatable by editors"
ON public.contracts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_edit')
);

CREATE POLICY "Contracts deletable by deleters"
ON public.contracts FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_delete')
);

CREATE TRIGGER trg_contracts_touch
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_contracts_created_at ON public.contracts(created_at DESC);
CREATE INDEX idx_contracts_year_month ON public.contracts(year, month);
