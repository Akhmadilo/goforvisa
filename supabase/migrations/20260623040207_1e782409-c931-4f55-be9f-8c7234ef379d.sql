
CREATE TABLE IF NOT EXISTS public.work_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  telegram_id bigint,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Tashkent')::date,
  content text NOT NULL,
  notif_messages jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_reports_employee_date ON public.work_reports(employee_id, date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_reports TO authenticated;
GRANT ALL ON public.work_reports TO service_role;

ALTER TABLE public.work_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and finance can view work reports"
  ON public.work_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financier'));

CREATE POLICY "Admins and finance can insert work reports"
  ON public.work_reports FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financier'));

CREATE POLICY "Admins and finance can update work reports"
  ON public.work_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financier'));

CREATE POLICY "Admins can delete work reports"
  ON public.work_reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_work_reports_touch
  BEFORE UPDATE ON public.work_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
