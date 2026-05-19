REVOKE EXECUTE ON FUNCTION public.recompute_expense_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_expense_payments_recompute() FROM PUBLIC, anon, authenticated;