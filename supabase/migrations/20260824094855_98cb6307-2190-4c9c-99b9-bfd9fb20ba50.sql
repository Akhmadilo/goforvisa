UPDATE public.contract_payments SET method = 'cash' WHERE method IS NULL OR btrim(method) = '';
UPDATE public.contract_payments SET method = 'cash' WHERE lower(btrim(method)) IN ('naqd','cash');
UPDATE public.contract_payments SET method = 'card' WHERE lower(btrim(method)) IN ('karta','card','plastik');
UPDATE public.contract_payments SET method = 'bank' WHERE lower(btrim(method)) IN ('bank','transfer','o''tkazma');
ALTER TABLE public.contract_payments ALTER COLUMN method SET DEFAULT 'cash';