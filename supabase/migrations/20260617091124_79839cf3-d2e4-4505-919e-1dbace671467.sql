
-- employee_schedules: weekly work start time per employee
CREATE TABLE public.employee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL DEFAULT '10:00',
  is_working boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, weekday)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_schedules TO authenticated;
GRANT ALL ON public.employee_schedules TO service_role;
ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read schedules" ON public.employee_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage schedules" ON public.employee_schedules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_employee_schedules_updated BEFORE UPDATE ON public.employee_schedules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- employee_telegram: link telegram accounts (pending until admin links employee)
CREATE TABLE public.employee_telegram (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  telegram_id bigint NOT NULL UNIQUE,
  telegram_username text,
  first_name text,
  last_name text,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX employee_telegram_employee_unique ON public.employee_telegram(employee_id) WHERE employee_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_telegram TO authenticated;
GRANT ALL ON public.employee_telegram TO service_role;
ALTER TABLE public.employee_telegram ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read telegram" ON public.employee_telegram FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage telegram" ON public.employee_telegram FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_employee_telegram_updated BEFORE UPDATE ON public.employee_telegram FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- attendance: daily check-in
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in_at timestamptz NOT NULL DEFAULT now(),
  face_id_confirmed boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'telegram',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read attendance" ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage attendance" ON public.attendance FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- fine_rules: configurable late-fine tiers
CREATE TABLE public.fine_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_minutes integer NOT NULL,
  max_minutes integer,
  amount_uzs numeric NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fine_rules TO authenticated;
GRANT ALL ON public.fine_rules TO service_role;
ALTER TABLE public.fine_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fine_rules" ON public.fine_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage fine_rules" ON public.fine_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fine_rules_updated BEFORE UPDATE ON public.fine_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.fine_rules (min_minutes, max_minutes, amount_uzs, label) VALUES
  (1, 30, 30000, '10:00–10:30'),
  (31, 120, 50000, '10:30–12:00'),
  (121, NULL, 100000, '12:00+');

-- fines: computed fines
CREATE TABLE public.fines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  minutes_late integer NOT NULL DEFAULT 0,
  amount_uzs numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'late',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date, reason)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fines TO authenticated;
GRANT ALL ON public.fines TO service_role;
ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fines" ON public.fines FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage fines" ON public.fines FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fines_updated BEFORE UPDATE ON public.fines FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
