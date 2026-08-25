UPDATE public.call_centre_tiers
SET tenant_id = '8b4777e1-f9db-41d8-bf20-3540e70ba3b0'
WHERE min_count = 20 AND max_count = 24
  AND tenant_id = '4390d1d2-17b4-4742-8930-2488f7a7bf2c';