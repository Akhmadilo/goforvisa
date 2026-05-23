-- 1) Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_expense_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_expense_payments_recompute() FROM PUBLIC, anon, authenticated;
-- has_role is needed by RLS policies for authenticated users; revoke anon only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 2) Storage: prevent listing employee-photos bucket; keep public URL access via CDN
DROP POLICY IF EXISTS "Employee photos public read" ON storage.objects;
DROP POLICY IF EXISTS "Employee photos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Public read employee-photos" ON storage.objects;
CREATE POLICY "Employee photos listable by authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'employee-photos');

-- 3) Realtime: only authenticated users can receive messages
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated can receive realtime"
ON realtime.messages FOR SELECT TO authenticated
USING (true);