
-- 1) Restrict usd_rates SELECT to admins or users with finance/expenses permission
DROP POLICY IF EXISTS "Rates viewable by authenticated" ON public.usd_rates;

CREATE POLICY "Rates viewable by permitted users"
ON public.usd_rates
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.widget_permissions wp
    WHERE wp.user_id = auth.uid()
      AND wp.widget_key IN ('finance_section', 'expenses_section', 'salaries_section')
  )
);

-- 2) Scope realtime.messages by topic + widget permission
DROP POLICY IF EXISTS "Authenticated users can receive broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can receive broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Allow authenticated to read realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;

CREATE POLICY "Realtime topic gated by widget permission"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    realtime.topic() = 'expenses-realtime'
    AND EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'expenses_section')
  )
  OR (
    realtime.topic() = 'salaries-realtime'
    AND EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'salaries_section')
  )
  OR (
    realtime.topic() = 'employees-realtime'
    AND EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'employees_section')
  )
);
