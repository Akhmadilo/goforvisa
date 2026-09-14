-- Private shared secret table for scheduled-task authentication (service role only)
CREATE TABLE IF NOT EXISTS public.cron_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.cron_secrets FROM anon, authenticated;
GRANT ALL ON public.cron_secrets TO service_role;
ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cron_secrets (name, secret)
VALUES ('hooks', '40ccf865bd56d63baf3212a9b3ab8377493035588881715c')
ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;

-- ============ Storage: tenant-scoped access ============
-- avatars: only the owner may read their own avatar folder
DROP POLICY IF EXISTS "Authenticated can view avatars" ON storage.objects;
CREATE POLICY "Users can view own avatar"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- contract-files: widget permission AND tenant ownership
DROP POLICY IF EXISTS "contract-files read" ON storage.objects;
CREATE POLICY "contract-files read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contract-files'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.widget_permissions wp
               WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_section')
  )
  AND (
    (storage.foldername(name))[1] = public.current_tenant_id()::text
    OR EXISTS (SELECT 1 FROM public.contracts c
               WHERE c.tenant_id = public.current_tenant_id()
                 AND (c.client_photo_url = name OR c.contract_pdf_url = name))
  )
);

DROP POLICY IF EXISTS "contract-files insert" ON storage.objects;
CREATE POLICY "contract-files insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contract-files'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.widget_permissions wp
               WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_create')
  )
  AND (storage.foldername(name))[1] = public.current_tenant_id()::text
);

DROP POLICY IF EXISTS "contract-files update" ON storage.objects;
CREATE POLICY "contract-files update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'contract-files'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.widget_permissions wp
               WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_edit')
  )
  AND (
    (storage.foldername(name))[1] = public.current_tenant_id()::text
    OR EXISTS (SELECT 1 FROM public.contracts c
               WHERE c.tenant_id = public.current_tenant_id()
                 AND (c.client_photo_url = name OR c.contract_pdf_url = name))
  )
);

DROP POLICY IF EXISTS "contract-files delete" ON storage.objects;
CREATE POLICY "contract-files delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'contract-files'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.widget_permissions wp
               WHERE wp.user_id = auth.uid() AND wp.widget_key = 'contracts_delete')
  )
  AND (
    (storage.foldername(name))[1] = public.current_tenant_id()::text
    OR EXISTS (SELECT 1 FROM public.contracts c
               WHERE c.tenant_id = public.current_tenant_id()
                 AND (c.client_photo_url = name OR c.contract_pdf_url = name))
  )
);

-- employee-photos: widget permission AND tenant ownership
DROP POLICY IF EXISTS "Employee photos readable by permitted" ON storage.objects;
CREATE POLICY "Employee photos readable by permitted"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.widget_permissions wp
               WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_section')
  )
  AND (
    (storage.foldername(name))[1] = public.current_tenant_id()::text
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.tenant_id = public.current_tenant_id() AND e.avatar_url = name)
  )
);

DROP POLICY IF EXISTS "Employee photos uploadable by permitted users" ON storage.objects;
CREATE POLICY "Employee photos uploadable by permitted users"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.widget_permissions wp
               WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
  )
  AND (storage.foldername(name))[1] = public.current_tenant_id()::text
);

DROP POLICY IF EXISTS "Employee photos updatable by permitted users" ON storage.objects;
CREATE POLICY "Employee photos updatable by permitted users"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.widget_permissions wp
               WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
  )
  AND (
    (storage.foldername(name))[1] = public.current_tenant_id()::text
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.tenant_id = public.current_tenant_id() AND e.avatar_url = name)
  )
);

DROP POLICY IF EXISTS "Employee photos deletable by permitted users" ON storage.objects;
CREATE POLICY "Employee photos deletable by permitted users"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.widget_permissions wp
               WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_create')
  )
  AND (
    (storage.foldername(name))[1] = public.current_tenant_id()::text
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.tenant_id = public.current_tenant_id() AND e.avatar_url = name)
  )
);