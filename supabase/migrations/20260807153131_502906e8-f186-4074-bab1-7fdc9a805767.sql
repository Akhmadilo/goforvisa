CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

DROP POLICY "tenants: platform admin manage" ON public.tenants;
CREATE POLICY "tenants: platform admin manage" ON public.tenants FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY "tenant_members: platform admin manage" ON public.tenant_members;
CREATE POLICY "tenant_members: platform admin manage" ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY "platform_admins: self read" ON public.platform_admins;
CREATE POLICY "platform_admins: self read" ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY "plans: platform admin manage" ON public.plans;
CREATE POLICY "plans: platform admin manage" ON public.plans FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY "subscriptions: own tenant read" ON public.subscriptions;
CREATE POLICY "subscriptions: own tenant read" ON public.subscriptions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin());
DROP POLICY "subscriptions: platform admin manage" ON public.subscriptions;
CREATE POLICY "subscriptions: platform admin manage" ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY "invoices: own tenant read" ON public.subscription_invoices;
CREATE POLICY "invoices: own tenant read" ON public.subscription_invoices FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin());
DROP POLICY "invoices: platform admin manage" ON public.subscription_invoices;
CREATE POLICY "invoices: platform admin manage" ON public.subscription_invoices FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP FUNCTION IF EXISTS public.is_platform_admin(uuid);
