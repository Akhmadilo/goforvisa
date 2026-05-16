
-- Per-user widget visibility on dashboard
CREATE TABLE public.widget_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  widget_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, widget_key)
);

ALTER TABLE public.widget_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own widget permissions"
ON public.widget_permissions FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage widget permissions"
ON public.widget_permissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_widget_permissions_user ON public.widget_permissions(user_id);
