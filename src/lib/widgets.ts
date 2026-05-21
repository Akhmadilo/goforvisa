export type WidgetGroup = "dashboard" | "salaries" | "expenses";

export const WIDGET_GROUPS: { key: WidgetGroup; label: string }[] = [
  { key: "dashboard", label: "Dashboard bo'limi" },
  { key: "salaries", label: "Ishchilar oyliklari bo'limi" },
  { key: "expenses", label: "Xarajatlar bo'limi" },
];

export const WIDGETS = [
  // Dashboard
  { key: "kpi", group: "dashboard", label: "KPI ko'rsatkichlari (yuqori panel)" },
  { key: "monthly_revenue", group: "dashboard", label: "Oylik daromad va sof foyda" },
  { key: "visa_results", group: "dashboard", label: "Visa natijalari" },
  { key: "managers_revenue", group: "dashboard", label: "Sotuv menejerlari · daromad va sof foyda" },
  { key: "contract_types", group: "dashboard", label: "Shartnoma turlari" },
  { key: "managers_clients", group: "dashboard", label: "Menejerlar bo'yicha mijozlar soni" },
  { key: "companies_sales_pie", group: "dashboard", label: "Kompaniyalar bo'yicha sotuvlar" },
  { key: "companies_revenue", group: "dashboard", label: "Kompaniyalar · daromad va sof foyda" },
  { key: "sales_monthly", group: "dashboard", label: "Sotuv menejerlari · oylik sotuvlar" },
  { key: "backoffice_monthly", group: "dashboard", label: "Back office · oylik hujjatlar" },
  { key: "companies_monthly", group: "dashboard", label: "Kompaniyalar · oylik sotuvlar" },
  { key: "debtors", group: "dashboard", label: "Qarzdorlar ro'yxati" },
  { key: "contracts_table", group: "dashboard", label: "Shartnomalar ro'yxati (jadval)" },
  // Salaries
  { key: "salaries_section", group: "salaries", label: "Bo'limga kirish (sahifa)" },
  { key: "salaries_totals", group: "salaries", label: "Umumiy kartalar" },
  { key: "salaries_pivot", group: "salaries", label: "Pivot jadval (oylar × ishchilar)" },
  { key: "salaries_table", group: "salaries", label: "To'liq jadval" },
  { key: "salaries_create", group: "salaries", label: "Oylik yaratish / tahrirlash / o'chirish" },
  // Expenses
  { key: "expenses_section", group: "expenses", label: "Bo'limga kirish (sahifa)" },
  { key: "expenses_totals", group: "expenses", label: "Umumiy kartalar" },
  { key: "expenses_table", group: "expenses", label: "Xarajatlar jadvali" },
  { key: "expenses_create", group: "expenses", label: "Xarajat yaratish / tahrirlash / o'chirish" },
] as const;

export type WidgetKey = (typeof WIDGETS)[number]["key"];
