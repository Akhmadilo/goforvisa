-- ============ 1. TENANTS ============
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  logo_url text,
  contact_email text,
  contact_phone text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- ============ 2. HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id);
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;

-- ============ 3. SEED FIRST TENANT ============
INSERT INTO public.tenants (name, slug, contact_email)
VALUES ('GoForVisa', 'goforvisa', NULL);

CREATE OR REPLACE FUNCTION public.tenant_default()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    public.current_tenant_id(),
    (SELECT id FROM public.tenants WHERE slug = 'goforvisa')
  );
$$;
REVOKE ALL ON FUNCTION public.tenant_default() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_default() TO authenticated, service_role;

-- every existing auth user joins GoForVisa
INSERT INTO public.tenant_members (user_id, tenant_id, is_owner)
SELECT u.id, (SELECT id FROM public.tenants WHERE slug='goforvisa'),
       EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin')
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ============ 4. PLANS & SUBSCRIPTIONS ============
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_uzs numeric NOT NULL DEFAULT 0,
  interval text NOT NULL DEFAULT 'month',
  max_users integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

INSERT INTO public.plans (code, name, price_uzs, max_users, features) VALUES
  ('starter','Starter', 1200000, 10, '["Shartnomalar","Xodimlar","Oyliklar"]'::jsonb),
  ('business','Business', 2500000, 30, '["Starter","KPI","Moliyaviy hisobot","Telegram bot"]'::jsonb),
  ('enterprise','Enterprise', 5000000, NULL, '["Business","Cheksiz foydalanuvchi","Ustuvor qo''llab-quvvatlash"]'::jsonb);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'trialing',
  trial_ends_at timestamptz,
  current_period_start date,
  current_period_end date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount_uzs numeric NOT NULL,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'unpaid',
  paid_at date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_invoices TO authenticated;
GRANT ALL ON public.subscription_invoices TO service_role;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
SELECT (SELECT id FROM public.tenants WHERE slug='goforvisa'),
       (SELECT id FROM public.plans WHERE code='enterprise'),
       'active', CURRENT_DATE, (CURRENT_DATE + INTERVAL '10 years')::date;

CREATE TRIGGER tenants_touch BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER plans_touch BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER subscription_invoices_touch BEFORE UPDATE ON public.subscription_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 5. POLICIES FOR PLATFORM TABLES ============
CREATE POLICY "tenants: platform admin manage" ON public.tenants FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "tenants: members read own" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id());
GRANT INSERT, UPDATE, DELETE ON public.tenants TO authenticated;

CREATE POLICY "tenant_members: platform admin manage" ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "tenant_members: read own row" ON public.tenant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR tenant_id = public.current_tenant_id());
GRANT INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;

CREATE POLICY "platform_admins: self read" ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "plans: read" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans: platform admin manage" ON public.plans FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;

CREATE POLICY "subscriptions: own tenant read" ON public.subscriptions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "subscriptions: platform admin manage" ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;

CREATE POLICY "invoices: own tenant read" ON public.subscription_invoices FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "invoices: platform admin manage" ON public.subscription_invoices FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.subscription_invoices TO authenticated;

-- ============ 6. ADD tenant_id TO ALL DATA TABLES ============
DO $do$
DECLARE
  t text;
  tables text[] := ARRAY[
    'advance_requests','attendance','companies','contract_payments','contract_types','contracts',
    'employee_base_salaries','employee_schedules','employee_telegram','employees',
    'expense_categories','expense_payments','expenses','extra_bonuses','fine_rules','fines',
    'leave_requests','operators','positions','salaries','salary_payments',
    'sales_kpi_approvals','sales_kpi_rates','usd_rates','user_roles','widget_permissions','work_reports'
  ];
  gid uuid := (SELECT id FROM public.tenants WHERE slug='goforvisa');
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, gid);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.tenant_default()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE', t, t||'_tenant_fk');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', 'idx_'||t||'_tenant', t);
    -- restrictive tenant boundary layered on top of existing role/widget policies
    EXECUTE format($p$CREATE POLICY "tenant isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (tenant_id = public.current_tenant_id())
      WITH CHECK (tenant_id = public.current_tenant_id())$p$, t);
  END LOOP;
END
$do$;
