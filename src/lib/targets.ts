/** Monthly per-employee targets: contracts sold (sales manager) and documents submitted (back office). */
export type TargetRow = {
  employee_id: string;
  contracts_target: number;
  docs_target: number;
};

export type TargetContract = {
  contract_date: string | null;
  sales_manager: string | null;
  back_office_manager: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const to = `${next.y}-${String(next.m).padStart(2, "0")}-01`;
  return { from, to };
}

/** Counts contracts in the month where the employee is sales manager / back office manager. */
export function countActuals(fullName: string, contracts: TargetContract[], year: number, month: number) {
  const { from, to } = monthRange(year, month);
  const n = norm(fullName);
  let sold = 0;
  let docs = 0;
  for (const c of contracts) {
    if (!c.contract_date || c.contract_date < from || c.contract_date >= to) continue;
    if (norm(c.sales_manager) === n) sold++;
    if (norm(c.back_office_manager) === n) docs++;
  }
  return { sold, docs };
}

export function pct(actual: number, target: number) {
  if (!target) return null;
  return Math.round((actual / target) * 100);
}
