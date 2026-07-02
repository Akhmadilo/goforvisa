CREATE TABLE public.salary_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salary_id UUID NOT NULL REFERENCES public.salaries(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('advance', 'manual')),
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX salary_payments_salary_id_idx ON public.salary_payments(salary_id);
CREATE UNIQUE INDEX salary_payments_one_advance_per_salary
  ON public.salary_payments(salary_id) WHERE kind = 'advance';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_payments TO authenticated;
GRANT ALL ON public.salary_payments TO service_role;

ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read salary payments"
  ON public.salary_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/creators can insert salary payments"
  ON public.salary_payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions
      WHERE user_id = auth.uid() AND widget_key = 'salaries_create'
    )
  );

CREATE POLICY "Admins/creators can update salary payments"
  ON public.salary_payments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions
      WHERE user_id = auth.uid() AND widget_key = 'salaries_create'
    )
  );

CREATE POLICY "Admins can delete salary payments"
  ON public.salary_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER salary_payments_updated_at
  BEFORE UPDATE ON public.salary_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.sync_salary_advance_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.advance_amount, 0) > 0 THEN
    INSERT INTO public.salary_payments (salary_id, amount, kind, paid_at, note)
    VALUES (NEW.id, NEW.advance_amount, 'advance', CURRENT_DATE, 'Avtomatik avans')
    ON CONFLICT (salary_id) WHERE kind = 'advance'
    DO UPDATE SET amount = EXCLUDED.amount;
  ELSE
    DELETE FROM public.salary_payments WHERE salary_id = NEW.id AND kind = 'advance';
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.sync_salary_advance_payment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER salaries_sync_advance_ins
  AFTER INSERT ON public.salaries
  FOR EACH ROW EXECUTE FUNCTION public.sync_salary_advance_payment();

CREATE TRIGGER salaries_sync_advance_upd
  AFTER UPDATE OF advance_amount ON public.salaries
  FOR EACH ROW EXECUTE FUNCTION public.sync_salary_advance_payment();

INSERT INTO public.salary_payments (salary_id, amount, kind, paid_at, note)
SELECT id, advance_amount, 'advance', COALESCE(created_at::date, CURRENT_DATE), 'Avtomatik avans (backfill)'
FROM public.salaries
WHERE COALESCE(advance_amount, 0) > 0
ON CONFLICT DO NOTHING;
