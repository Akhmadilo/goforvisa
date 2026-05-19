CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  total_amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'UZS',
  vendor text,
  notes text,
  status text NOT NULL DEFAULT 'unpaid',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_payments_expense_id_idx ON public.expense_payments(expense_id);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;

-- Only users that have the 'expenses_section' widget permission (or admins) can view/manage
CREATE POLICY "Expenses viewable by permitted users"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Expenses insertable by permitted users"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Expenses updatable by permitted users"
  ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Expenses deletable by permitted users"
  ON public.expenses FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Expense payments viewable by permitted users"
  ON public.expense_payments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Expense payments insertable by permitted users"
  ON public.expense_payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Expense payments updatable by permitted users"
  ON public.expense_payments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Expense payments deletable by permitted users"
  ON public.expense_payments FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

-- Function to recompute expense status based on sum of payments
CREATE OR REPLACE FUNCTION public.recompute_expense_status(_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paid_total numeric;
  total_amt numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO paid_total
  FROM public.expense_payments WHERE expense_id = _expense_id;

  SELECT total_amount INTO total_amt
  FROM public.expenses WHERE id = _expense_id;

  IF total_amt IS NULL THEN RETURN; END IF;

  UPDATE public.expenses
  SET status = CASE
    WHEN paid_total >= total_amt THEN 'paid'
    WHEN paid_total > 0 THEN 'partial'
    ELSE 'unpaid'
  END
  WHERE id = _expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_expense_payments_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_expense_status(OLD.expense_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_expense_status(NEW.expense_id);
    IF TG_OP = 'UPDATE' AND OLD.expense_id <> NEW.expense_id THEN
      PERFORM public.recompute_expense_status(OLD.expense_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS expense_payments_recompute ON public.expense_payments;
CREATE TRIGGER expense_payments_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.expense_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_expense_payments_recompute();

-- Enable realtime
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.expense_payments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_payments;