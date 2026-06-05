
CREATE POLICY "contract-files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contract-files' AND (
    has_role(auth.uid(),'admin') OR EXISTS (
      SELECT 1 FROM widget_permissions wp WHERE wp.user_id=auth.uid() AND wp.widget_key='contracts_section'
    )
  ));

CREATE POLICY "contract-files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contract-files' AND (
    has_role(auth.uid(),'admin') OR EXISTS (
      SELECT 1 FROM widget_permissions wp WHERE wp.user_id=auth.uid() AND wp.widget_key='contracts_create'
    )
  ));

CREATE POLICY "contract-files update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contract-files' AND (
    has_role(auth.uid(),'admin') OR EXISTS (
      SELECT 1 FROM widget_permissions wp WHERE wp.user_id=auth.uid() AND wp.widget_key='contracts_edit'
    )
  ));

CREATE POLICY "contract-files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contract-files' AND (
    has_role(auth.uid(),'admin') OR EXISTS (
      SELECT 1 FROM widget_permissions wp WHERE wp.user_id=auth.uid() AND wp.widget_key='contracts_delete'
    )
  ));
