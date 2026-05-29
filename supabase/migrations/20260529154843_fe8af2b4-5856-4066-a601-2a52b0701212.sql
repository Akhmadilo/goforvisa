-- 1) Make employee-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'employee-photos';

-- Storage policies for employee-photos: only admins or users with employees_section can read; only employees_create can write
DROP POLICY IF EXISTS "Employee photos readable by permitted" ON storage.objects;
CREATE POLICY "Employee photos readable by permitted"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_section'
    )
  )
);

DROP POLICY IF EXISTS "Employee photos writable by creators" ON storage.objects;
CREATE POLICY "Employee photos writable by creators"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create'
    )
  )
);

DROP POLICY IF EXISTS "Employee photos updatable by creators" ON storage.objects;
CREATE POLICY "Employee photos updatable by creators"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create'
    )
  )
);

DROP POLICY IF EXISTS "Employee photos deletable by creators" ON storage.objects;
CREATE POLICY "Employee photos deletable by creators"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.widget_permissions wp
      WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create'
    )
  )
);

-- 2) Remove expense_categories from realtime publication (no client subscribes to it; avoids ungated broadcast)
ALTER PUBLICATION supabase_realtime DROP TABLE public.expense_categories;