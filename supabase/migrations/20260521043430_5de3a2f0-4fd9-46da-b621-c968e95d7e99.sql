CREATE TABLE public.salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL,
  fixed_amount numeric NOT NULL DEFAULT 0,
  kpi_amount numeric NOT NULL DEFAULT 0,
  penalty_amount numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX salaries_emp_period_idx ON public.salaries (employee_name, year, month);

ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salaries viewable by permitted users"
ON public.salaries FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_section'
  )
);

CREATE POLICY "Salaries insertable by creators"
ON public.salaries FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_create'
  )
);

CREATE POLICY "Salaries updatable by creators"
ON public.salaries FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_create'
  )
);

CREATE POLICY "Salaries deletable by creators"
ON public.salaries FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM widget_permissions wp
    WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_create'
  )
);

CREATE TRIGGER salaries_touch_updated_at
BEFORE UPDATE ON public.salaries
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.salaries;

INSERT INTO public.salaries (employee_name, month, year, fixed_amount, kpi_amount, penalty_amount, note, created_by) VALUES
('Boriyxon',6,2025,4000000,0,490000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',6,2025,2540000,0,0,'200$','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',6,2025,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Boriyxon',7,2025,4000000,2775000,780000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',7,2025,2535000,0,0,'200$','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',7,2025,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Boriyxon',8,2025,4000000,3950000,550000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',8,2025,2490000,0,0,'200$','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',8,2025,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ruxshona',8,2025,1760000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ruxshona',9,2025,1600000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Marjona',9,2025,3000000,2100000,120000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Boriyxon',9,2025,4000000,1825000,910000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Shaxnoza',9,2025,2192308,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',9,2025,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',9,2025,2420000,0,0,'200$','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Marjona',10,2025,4000000,6062500,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Boriyxon',10,2025,4000000,700000,420000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Shaxnoza',10,2025,3000000,1800000,1260000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',10,2025,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',10,2025,2400000,0,0,'200$','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',11,2025,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',11,2025,1198000,0,0,'200$','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Marjona',11,2025,4000000,6682500,120000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Zaxro',11,2025,2270000,175000,210000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',12,2025,2398000,0,0,'200$','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',12,2025,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Marjona',12,2025,4000000,4140000,240000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Madina',1,2026,830000,300000,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Marjona',1,2026,4000000,7112500,150000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',1,2026,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Durdona',1,2026,2000000,775000,220000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',1,2026,2400000,353359,0,'KPI = 2.5%','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',2,2026,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Marjona',2,2026,4000000,5360000,240000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Durdona',2,2026,1285000,130000,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Madina',2,2026,3000000,3025000,675000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',2,2026,2420000,1000000,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',3,2026,2450000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Tozalik hodimi',3,2026,750000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Kamola',3,2026,917000,0,270000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Behruz',3,2026,600000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Madina',3,2026,2500000,6662500,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Behruz',4,2026,3000000,1000000,150000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Madina Nabieva',4,2026,2000000,0,220000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Madina',4,2026,2500000,7700000,150000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Boriyxon',4,2026,3000000,500000,30000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Ahmadillo',4,2026,2400000,0,0,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd'),
('Soliha',4,2026,790000,0,90000,'','a102cc52-bbf8-48c0-b902-af78cb8dccbd');