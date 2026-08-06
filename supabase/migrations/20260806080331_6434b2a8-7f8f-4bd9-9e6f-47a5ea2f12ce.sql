CREATE TABLE public.extra_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  amount_uzs numeric NOT NULL DEFAULT 0,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extra_bonuses TO authenticated;
GRANT ALL ON public.extra_bonuses TO service_role;
ALTER TABLE public.extra_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Extra bonuses viewable by permitted users" ON public.extra_bonuses FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_section'));
CREATE POLICY "Extra bonuses insertable by creators" ON public.extra_bonuses FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_create'));
CREATE POLICY "Extra bonuses updatable by editors" ON public.extra_bonuses FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_edit'));
CREATE POLICY "Extra bonuses deletable by deleters" ON public.extra_bonuses FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_delete'));
CREATE TRIGGER extra_bonuses_touch BEFORE UPDATE ON public.extra_bonuses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_extra_bonuses_period ON public.extra_bonuses (employee_name, year, month);

CREATE TABLE public.employee_base_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text NOT NULL UNIQUE,
  amount_uzs numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_base_salaries TO authenticated;
GRANT ALL ON public.employee_base_salaries TO service_role;
ALTER TABLE public.employee_base_salaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Base salaries readable by authenticated" ON public.employee_base_salaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Base salaries managed by admin" ON public.employee_base_salaries FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER employee_base_salaries_touch BEFORE UPDATE ON public.employee_base_salaries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();