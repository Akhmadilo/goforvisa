DROP POLICY IF EXISTS "auth read positions" ON public.positions;

CREATE POLICY "positions view by employees users"
ON public.positions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.widget_permissions wp
    WHERE wp.user_id = auth.uid()
      AND wp.widget_key IN ('employees_section', 'employees_create')
  )
);