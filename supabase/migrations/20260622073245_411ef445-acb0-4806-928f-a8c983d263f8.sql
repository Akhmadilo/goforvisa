ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_key ON public.employees(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_user_id_idx ON public.employees(user_id);