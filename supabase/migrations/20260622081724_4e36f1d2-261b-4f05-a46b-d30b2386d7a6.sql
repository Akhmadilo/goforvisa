DELETE FROM public.fine_rules WHERE id = 'b2c0c5f6-b4dc-4f38-9344-33e381fb4464';
ALTER TABLE public.fine_rules ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fine_rules_employee ON public.fine_rules(employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS fine_rules_emp_kind_min_uidx
  ON public.fine_rules(COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, COALESCE(min_minutes, -1));