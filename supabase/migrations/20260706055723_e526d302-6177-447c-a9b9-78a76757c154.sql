
ALTER TABLE public.sales_kpi_rates ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'sales';
ALTER TABLE public.sales_kpi_rates DROP CONSTRAINT IF EXISTS sales_kpi_rates_manager_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS sales_kpi_rates_role_manager_uk ON public.sales_kpi_rates (role, manager_name);

ALTER TABLE public.sales_kpi_approvals ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'sales';
ALTER TABLE public.sales_kpi_approvals DROP CONSTRAINT IF EXISTS sales_kpi_approvals_contract_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS sales_kpi_approvals_role_contract_uk ON public.sales_kpi_approvals (role, contract_id);
