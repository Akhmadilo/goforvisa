
-- Add photo and pdf urls to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS client_photo_url text,
  ADD COLUMN IF NOT EXISTS contract_pdf_url text;

-- Drop unused columns
ALTER TABLE public.contracts
  DROP COLUMN IF EXISTS kpi_sales,
  DROP COLUMN IF EXISTS kpi_back_office,
  DROP COLUMN IF EXISTS total,
  DROP COLUMN IF EXISTS visa_fee;

-- Contract payments table (a client can pay in multiple installments)
CREATE TABLE IF NOT EXISTS public.contract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UZS',
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO authenticated;
GRANT ALL ON public.contract_payments TO service_role;

ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract payments viewable by permitted users"
  ON public.contract_payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_section'
  ));

CREATE POLICY "Contract payments insertable by creators"
  ON public.contract_payments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_create'
  ));

CREATE POLICY "Contract payments updatable by editors"
  ON public.contract_payments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_edit'
  ));

CREATE POLICY "Contract payments deletable by deleters"
  ON public.contract_payments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_delete'
  ));

CREATE INDEX IF NOT EXISTS idx_contract_payments_contract ON public.contract_payments(contract_id);

CREATE TRIGGER trg_contract_payments_touch
  BEFORE UPDATE ON public.contract_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
