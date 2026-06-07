
CREATE TABLE public.contract_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_types TO authenticated;
GRANT ALL ON public.contract_types TO service_role;
ALTER TABLE public.contract_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contract_types view by contracts users" ON public.contract_types FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR EXISTS(SELECT 1 FROM widget_permissions wp WHERE wp.user_id=auth.uid() AND wp.widget_key='contracts_section'));
CREATE POLICY "contract_types manage by admin" ON public.contract_types FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies view by contracts users" ON public.companies FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR EXISTS(SELECT 1 FROM widget_permissions wp WHERE wp.user_id=auth.uid() AND wp.widget_key='contracts_section'));
CREATE POLICY "companies manage by admin" ON public.companies FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.companies(name) VALUES ('Dream'),('Go for Visa') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.contract_types(name) VALUES ('Tourist'),('Student'),('Work'),('Business'),('Family') ON CONFLICT (name) DO NOTHING;
