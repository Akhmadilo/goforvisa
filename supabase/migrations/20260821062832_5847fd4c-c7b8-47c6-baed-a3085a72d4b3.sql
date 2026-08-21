CREATE TABLE public.telegram_groups (
  chat_id bigint PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT public.tenant_default() REFERENCES public.tenants(id),
  title text,
  kind text NOT NULL DEFAULT 'daily_cash',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_groups TO authenticated;
GRANT ALL ON public.telegram_groups TO service_role;
ALTER TABLE public.telegram_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_groups_select" ON public.telegram_groups FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tg_groups_admin_write" ON public.telegram_groups FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'admin')) WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'admin'));
CREATE TRIGGER telegram_groups_touch BEFORE UPDATE ON public.telegram_groups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.daily_cash_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_default() REFERENCES public.tenants(id),
  chat_id bigint NOT NULL,
  message_id bigint,
  date date NOT NULL,
  total_uzs numeric NOT NULL DEFAULT 0,
  total_usd numeric NOT NULL DEFAULT 0,
  payments_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  decided_by_tg bigint,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_cash_reports TO authenticated;
GRANT ALL ON public.daily_cash_reports TO service_role;
ALTER TABLE public.daily_cash_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dcr_select" ON public.daily_cash_reports FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "dcr_admin_write" ON public.daily_cash_reports FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'admin')) WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'admin'));
CREATE TRIGGER daily_cash_reports_touch BEFORE UPDATE ON public.daily_cash_reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();