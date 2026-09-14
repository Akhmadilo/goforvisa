ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS position text;

CREATE OR REPLACE FUNCTION public.protect_profile_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.position IS DISTINCT FROM OLD.position
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.is_platform_admin() THEN
    NEW.position := OLD.position;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_position ON public.profiles;
CREATE TRIGGER trg_protect_profile_position
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_position();

CREATE POLICY "Admins can update tenant profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = profiles.id AND tm.tenant_id = public.current_tenant_id()
  )
);