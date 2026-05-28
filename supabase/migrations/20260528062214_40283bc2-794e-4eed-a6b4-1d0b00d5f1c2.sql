
-- Fix: add restrictive UPDATE policy to expense_categories
CREATE POLICY "Categories updatable by admins"
ON public.expense_categories
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix: remove open SELECT realtime policy that bypassed widget gating
DROP POLICY IF EXISTS "Authenticated can receive realtime" ON realtime.messages;
