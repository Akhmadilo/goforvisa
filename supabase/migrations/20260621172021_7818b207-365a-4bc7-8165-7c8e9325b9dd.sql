
-- Positions table
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.positions TO authenticated;
GRANT ALL ON public.positions TO service_role;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read positions" ON public.positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write positions" ON public.positions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_positions_updated_at BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed common positions
INSERT INTO public.positions (name) VALUES
  ('Direktor'), ('Menejer'), ('Operator'), ('Konsultant'), ('Buxgalter'), ('Marketolog')
ON CONFLICT (name) DO NOTHING;

-- Leave requests table (dam olish so'rovlari)
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text,
  status public.leave_status NOT NULL DEFAULT 'pending',
  salary_counts boolean,
  fine_amount_uzs numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Admin or financier can read all
CREATE POLICY "admin/financier read leaves" ON public.leave_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financier'));
-- Admin or financier can insert
CREATE POLICY "admin/financier insert leaves" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financier'));
-- Only admin can update (approve/reject), financier can update only pending rows
CREATE POLICY "admin update leaves" ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "financier update pending leaves" ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'financier') AND status = 'pending')
  WITH CHECK (public.has_role(auth.uid(), 'financier') AND status = 'pending');
CREATE POLICY "admin delete leaves" ON public.leave_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_leave_requests_emp_date ON public.leave_requests(employee_id, date);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);
