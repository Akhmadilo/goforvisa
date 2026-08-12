CREATE TABLE public.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled_modules text[] NOT NULL DEFAULT ARRAY['salaries_section','expenses_section','employees_section','finance_section','contracts_section','kpi_section','fines_section'],
  brand_name text,
  brand_logo_url text,
  brand_primary text,
  currency text NOT NULL DEFAULT 'UZS',
  business_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own tenant settings"
ON public.tenant_settings FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

CREATE POLICY "platform admin insert tenant settings"
ON public.tenant_settings FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform admin update tenant settings"
ON public.tenant_settings FOR UPDATE TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform admin delete tenant settings"
ON public.tenant_settings FOR DELETE TO authenticated
USING (public.is_platform_admin());

CREATE TRIGGER tenant_settings_touch
BEFORE UPDATE ON public.tenant_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.tenant_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;