CREATE OR REPLACE FUNCTION public.month_compare_metrics(_from date, _to date, _years int[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'pay', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT to_char(paid_at, 'YYYY-MM') AS k, upper(coalesce(currency,'UZS')) AS c, sum(amount)::numeric AS a
        FROM public.contract_payments
        WHERE paid_at >= _from AND paid_at < _to
        GROUP BY 1, 2
      ) x), '[]'::jsonb),
    'con', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT to_char(contract_date, 'YYYY-MM') AS k,
               COALESCE(NULLIF(btrim(sales_manager), ''), '—') AS mgr,
               count(*)::int AS n,
               sum(price_uzs)::numeric AS uzs,
               sum(CASE WHEN price_uzs > 0 THEN 0 ELSE price_usd END)::numeric AS usd
        FROM public.contracts
        WHERE contract_date >= _from AND contract_date < _to
        GROUP BY 1, 2
      ) x), '[]'::jsonb),
    'exp', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT to_char(expense_date, 'YYYY-MM') AS k, category AS cat,
               upper(coalesce(currency,'UZS')) AS c, sum(total_amount)::numeric AS a
        FROM public.expenses
        WHERE expense_date >= _from AND expense_date < _to
        GROUP BY 1, 2, 3
      ) x), '[]'::jsonb),
    'sal', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT (year::text || '-' || lpad(month::text, 2, '0')) AS k,
               sum(fixed_amount + kpi_amount - penalty_amount)::numeric AS a
        FROM public.salaries
        WHERE year = ANY(_years)
        GROUP BY 1
      ) x), '[]'::jsonb),
    'fin', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT to_char(date, 'YYYY-MM') AS k, sum(amount_uzs)::numeric AS a
        FROM public.fines
        WHERE date >= _from AND date < _to
        GROUP BY 1
      ) x), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.month_compare_metrics(date, date, int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.month_compare_metrics(date, date, int[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.month_compare_metrics(date, date, int[]) TO service_role;