ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();
UPDATE public.expenses SET created_by = 'a102cc52-bbf8-48c0-b902-af78cb8dccbd' WHERE created_by IS NULL;