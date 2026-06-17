
-- Tighten SELECT policies on jarima tables
DROP POLICY IF EXISTS "auth read schedules" ON public.employee_schedules;
DROP POLICY IF EXISTS "auth read telegram" ON public.employee_telegram;
DROP POLICY IF EXISTS "auth read attendance" ON public.attendance;
DROP POLICY IF EXISTS "auth read fine_rules" ON public.fine_rules;
DROP POLICY IF EXISTS "auth read fines" ON public.fines;

CREATE POLICY "permitted read schedules" ON public.employee_schedules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'fines_section'));

CREATE POLICY "permitted read telegram" ON public.employee_telegram FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'fines_section'));

CREATE POLICY "permitted read attendance" ON public.attendance FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'fines_section'));

CREATE POLICY "permitted read fine_rules" ON public.fine_rules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'fines_section'));

CREATE POLICY "permitted read fines" ON public.fines FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.widget_permissions wp WHERE wp.user_id = auth.uid() AND wp.widget_key = 'fines_section'));
