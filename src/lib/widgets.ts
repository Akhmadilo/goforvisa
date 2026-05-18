export const WIDGETS = [
  { key: "kpi", label: "KPI ko'rsatkichlari (yuqori panel)" },
  { key: "monthly_revenue", label: "Oylik daromad va sof foyda" },
  { key: "visa_results", label: "Visa natijalari" },
  { key: "managers_revenue", label: "Sotuv menejerlari · daromad va sof foyda" },
  { key: "contract_types", label: "Shartnoma turlari" },
  { key: "managers_clients", label: "Menejerlar bo'yicha mijozlar soni" },
  { key: "companies_sales_pie", label: "Kompaniyalar bo'yicha sotuvlar" },
  { key: "companies_revenue", label: "Kompaniyalar · daromad va sof foyda" },
  { key: "sales_monthly", label: "Sotuv menejerlari · oylik sotuvlar" },
  { key: "backoffice_monthly", label: "Back office · oylik hujjatlar" },
  { key: "companies_monthly", label: "Kompaniyalar · oylik sotuvlar" },
  { key: "debtors", label: "Qarzdorlar ro'yxati" },
  { key: "contracts_table", label: "Shartnomalar ro'yxati (jadval)" },
  { key: "salaries_section", label: "Ishchilar oyliklari — bo'lim (sahifa)" },
  { key: "salaries_totals", label: "Ishchilar oyliklari — umumiy kartalar" },
  { key: "salaries_pivot", label: "Ishchilar oyliklari — pivot jadval (oylar × ishchilar)" },
  { key: "salaries_table", label: "Ishchilar oyliklari — to'liq jadval" },
] as const;

export type WidgetKey = (typeof WIDGETS)[number]["key"];
