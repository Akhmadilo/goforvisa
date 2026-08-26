CREATE TABLE IF NOT EXISTS public.bot_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  notify_on_payment boolean NOT NULL DEFAULT true,
  notify_on_contract boolean NOT NULL DEFAULT false,
  daily_report_enabled boolean NOT NULL DEFAULT true,
  daily_report_hour integer NOT NULL DEFAULT 21,
  mention_bosses boolean NOT NULL DEFAULT true,
  payment_template text NOT NULL DEFAULT '💰 <b>Yangi to''lov</b>%0A👤 {client}%0A💵 {amount}%0A🏷 {method}%0A🗓 {date}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_settings TO authenticated;
GRANT ALL ON public.bot_settings TO service_role;

ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_settings_select_tenant" ON public.bot_settings
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "bot_settings_admin_write" ON public.bot_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER bot_settings_touch BEFORE UPDATE ON public.bot_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();