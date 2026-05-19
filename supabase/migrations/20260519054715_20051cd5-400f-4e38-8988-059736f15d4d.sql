CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories viewable by permitted users"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Categories insertable by permitted users"
  ON public.expense_categories FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section'
    )
  );

CREATE POLICY "Categories deletable by admins"
  ON public.expense_categories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.expense_categories REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_categories;

INSERT INTO public.expense_categories (name) VALUES
  ('Rent'), ('Wifi'), ('Eating'), ('Documentation'), ('Facebook'),
  ('Ticket'), ('Intrepreter'), ('Telephone subscription fee'),
  ('Office supplies'), ('CRM'), ('Maintenance'), ('Taxi'),
  ('Business trip'), ('Utilities'), ('Repair'), ('Equipment')
ON CONFLICT (name) DO NOTHING;