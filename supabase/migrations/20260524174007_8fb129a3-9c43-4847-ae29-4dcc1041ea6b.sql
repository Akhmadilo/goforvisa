
-- Monthly USD/UZS rate table
CREATE TABLE public.usd_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  rate numeric NOT NULL CHECK (rate > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

ALTER TABLE public.usd_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rates viewable by authenticated"
  ON public.usd_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Rates manageable by admin"
  ON public.usd_rates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_usd_rates_updated_at
  BEFORE UPDATE ON public.usd_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
