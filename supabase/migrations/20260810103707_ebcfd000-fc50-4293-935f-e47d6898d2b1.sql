DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Profiles viewable within same tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = public.profiles.id
      AND tm.tenant_id = public.current_tenant_id()
  )
);