export type WidgetGroup = "dashboard" | "salaries" | "expenses" | "employees" | "finance" | "contracts";

export const WIDGET_GROUPS: { key: WidgetGroup; label: string }[] = [
  { key: "dashboard", label: "Dashboard bo'limi" },
  { key: "salaries", label: "Ishchilar oyliklari bo'limi" },
  { key: "expenses", label: "Xarajatlar bo'limi" },
  { key: "employees", label: "Ishchilar bo'limi" },
  { key: "finance", label: "Moliyaviy hisobotlar bo'limi" },
  { key: "contracts", label: "Shartnomalar bo'limi" },
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
  { key: "salaries_create", group: "salaries", label: "Oylik yaratish" },
  { key: "salaries_edit", group: "salaries", label: "Oylik tahrirlash" },
  { key: "salaries_delete", group: "salaries", label: "Oylik o'chirish" },
  // Expenses
  { key: "expenses_section", group: "expenses", label: "Bo'limga kirish (sahifa)" },
  { key: "expenses_totals", group: "expenses", label: "Umumiy kartalar" },
  { key: "expenses_table", group: "expenses", label: "Xarajatlar jadvali" },
  { key: "expenses_create", group: "expenses", label: "Xarajat yaratish" },
  { key: "expenses_edit", group: "expenses", label: "Xarajat tahrirlash" },
  { key: "expenses_delete", group: "expenses", label: "Xarajat o'chirish" },
  { key: "expenses_pay", group: "expenses", label: "To'lov qo'shish / o'chirish" },
  // Employees
  { key: "employees_section", group: "employees", label: "Bo'limga kirish (sahifa)" },
  { key: "employees_create", group: "employees", label: "Ishchi qo'shish / tahrirlash / o'chirish" },
  // Finance
  { key: "finance_section", group: "finance", label: "Bo'limga kirish (sahifa)" },
  // Contracts
  { key: "contracts_section", group: "contracts", label: "Bo'limga kirish (sahifa)" },
  { key: "contracts_create", group: "contracts", label: "Shartnoma qo'shish" },
  { key: "contracts_edit", group: "contracts", label: "Shartnoma tahrirlash" },
  { key: "contracts_delete", group: "contracts", label: "Shartnoma o'chirish" },
  { key: "contracts_pay", group: "contracts", label: "To'lov qo'shish / o'chirish" },
] as const;

export type WidgetKey = (typeof WIDGETS)[number]["key"];
