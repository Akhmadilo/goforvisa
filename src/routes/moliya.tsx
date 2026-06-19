import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { LineChart as LineChartIcon, LogOut, Shield, ChevronDown, TrendingUp, TrendingDown, DollarSign, Receipt, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { supabase } from "@/integrations/supabase/client";
import { getContracts, type Contract } from "@/lib/contracts.functions";
import { useUsdRates } from "@/lib/usd-rates";
import { useT, getMonthNames } from "@/lib/i18n";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/moliya")({
  component: FinancePage,
  head: () => ({
    meta: [
      { title: "Moliyaviy hisobot — GoForVisa" },
      { name: "description", content: "Accrual va cash basis bo'yicha moliyaviy hisobot" },
    ],
  }),
});

const MONTH_ORDER = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dashboardPeriod(c: Contract): { year: string; month: number; key: string } | null {
  const y = (c.year || "").trim();
  const mIdx = MONTH_ORDER.indexOf((c.month || "").trim());
  if (y && mIdx >= 0) {
    const month = mIdx + 1;
    return { year: y, month, key: `${y}-${String(month).padStart(2, "0")}` };
  }
  const date = parseContractDate(c.contractDate);
  if (!date) return null;
  const year = String(date.getFullYear());
  const month = date.getMonth() + 1;
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

// Gross contract value (Jami shartnoma) in USD — matches dashboard's "Jami shartnoma".
function contractGrossUsd(c: Contract, getRate: (ym: string) => number, ym: string): number {
  if (c.priceUsd > 0) return c.priceUsd;
  if (c.priceUzs > 0) return c.priceUzs / getRate(ym);
  return 0;
}

// Cash basis: only contracts that are fully paid.
// We treat anything other than "Partially" / "No payment" / empty as fully paid.
function isFullyPaid(c: Contract): boolean {
  const p = (c.payment || "").trim().toLowerCase();
  if (!p || p === "-") return false;
  if (p.startsWith("partial")) return false;
  if (p.startsWith("no ") || p === "no payment" || p === "nopayment") return false;
  return true;
}


// MONTHS sourced from i18n via getMonthNames(lang)


const nfUzs = new Intl.NumberFormat("uz-UZ");
const nfUsd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const makeFmt = (currency: "UZS" | "USD") => (n: number) =>
  currency === "UZS"
    ? nfUzs.format(Math.round(n)) + " so'm"
    : "$" + nfUsd.format(Math.round(n));
const fmtShort = (n: number) =>
  n >= 1_000_000_000 ? `${(n/1_000_000_000).toFixed(1)}B`
  : n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M`
  : n >= 1000 ? `${(n/1000).toFixed(0)}K`
  : String(Math.round(n));

type Expense = {
  id: string;
  category: string;
  total_amount: number;
  currency: string;
  expense_date: string;
};
type Payment = {
  expense_id: string;
  amount: number;
  paid_at: string;
};
type Salary = {
  id: string;
  year: number;
  month: number;
  fixed_amount: number;
  kpi_amount: number;
  penalty_amount: number;
};

function FinancePage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = useNavigate();
  const { t, lang } = useT();
  const MONTHS = getMonthNames(lang);


  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);
  useEffect(() => {
    if (!loading && !permsLoading && user && !can("finance_section")) navigate({ to: "/" });
  }, [loading, permsLoading, user, can, navigate]);

  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [year, setYear] = useState<string>("all");
  const [months, setMonths] = useState<number[]>([]);
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const fmt = useMemo(() => makeFmt(currency), [currency]);

  const fetchContracts = useServerFn(getContracts);
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => fetchContracts(),
    enabled: !!user,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["finance-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses").select("id, category, total_amount, currency, expense_date");
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
    enabled: !!user,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["finance-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_payments").select("expense_id, amount, paid_at");
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
    enabled: !!user,
  });

  const { data: salaries = [] } = useQuery({
    queryKey: ["finance-salaries"],
    queryFn: async (): Promise<Salary[]> => {
      const { data, error } = await supabase
        .from("salaries")
        .select("id, year, month, fixed_amount, kpi_amount, penalty_amount");
      if (error) throw error;
      return (data ?? []) as Salary[];
    },
    enabled: !!user,
  });

  const { getRate } = useUsdRates();

  const expenseUzs = (e: Expense): number => {
    const amt = Number(e.total_amount);
    if (e.currency === "USD") return amt * getRate(e.expense_date.slice(0, 7));
    return amt;
  };
  const paymentUzs = (p: Payment, exp?: Expense): number => {
    const amt = Number(p.amount);
    if (exp && exp.currency === "USD") return amt * getRate(p.paid_at.slice(0, 7));
    return amt;
  };

  // Build period-keyed series with parallel UZS and USD aggregates.
  // For each month key we use that month's rate to convert between UZS and USD.
  const {
    revenueByMonth, expenseByMonth, docCostsByMonth, expenseByCat, allYears, salariesTotalUzs,
    contractsCountByMonth, salariesByMonth,
  } = useMemo(() => {
    type Pair = { uzs: number; usd: number };
    const add = (m: Map<string, Pair>, k: string, p: Pair) => {
      const cur = m.get(k) ?? { uzs: 0, usd: 0 };
      m.set(k, { uzs: cur.uzs + p.uzs, usd: cur.usd + p.usd });
    };
    const revenueByMonth = new Map<string, Pair>();
    const expenseByMonth = new Map<string, Pair>();
    const docCostsByMonth = new Map<string, Pair>();
    const expenseByCat = new Map<string, Pair>();
    const contractsCountByMonth = new Map<string, number>();
    const salariesByMonth = new Map<string, Pair>();
    const ySet = new Set<string>();

    for (const c of contracts) {
      const period = dashboardPeriod(c);
      if (!period) continue;
      ySet.add(period.year);
      if (year !== "all" && period.year !== year) continue;
      if (months.length > 0 && !months.includes(period.month)) continue;
      if (basis === "cash" && !isFullyPaid(c)) continue;
      const key = period.key;
      const rate = getRate(key);
      const grossUsd = contractGrossUsd(c, getRate, key);
      add(revenueByMonth, key, { uzs: grossUsd * rate, usd: grossUsd });
      contractsCountByMonth.set(key, (contractsCountByMonth.get(key) ?? 0) + 1);
      const commissionUsd = Number(c.commission) || 0;
      const docUsd = grossUsd - commissionUsd;
      if (docUsd !== 0) add(docCostsByMonth, key, { uzs: docUsd * rate, usd: docUsd });
    }

    const expById = new Map<string, Expense>();
    for (const e of expenses) expById.set(e.id, e);

    const pushExpense = (key: string, amtUzs: number, amtUsd: number, cat: string) => {
      add(expenseByMonth, key, { uzs: amtUzs, usd: amtUsd });
      add(expenseByCat, cat, { uzs: amtUzs, usd: amtUsd });
    };

    if (basis === "accrual") {
      for (const e of expenses) {
        const y = e.expense_date.slice(0, 4);
        const mm = e.expense_date.slice(5, 7);
        const m = Number(mm);
        ySet.add(y);
        if (year !== "all" && y !== year) continue;
        if (months.length > 0 && !months.includes(m)) continue;
        const key = `${y}-${mm}`;
        const rate = getRate(key);
        const raw = Number(e.total_amount);
        const uzs = e.currency === "USD" ? raw * rate : raw;
        const usd = e.currency === "USD" ? raw : raw / rate;
        pushExpense(key, uzs, usd, e.category);
      }
    } else {
      for (const p of payments) {
        const y = p.paid_at.slice(0, 4);
        const mm = p.paid_at.slice(5, 7);
        const m = Number(mm);
        ySet.add(y);
        if (year !== "all" && y !== year) continue;
        if (months.length > 0 && !months.includes(m)) continue;
        const key = `${y}-${mm}`;
        const exp = expById.get(p.expense_id);
        const rate = getRate(key);
        const raw = Number(p.amount);
        const isUsd = exp?.currency === "USD";
        const uzs = isUsd ? raw * rate : raw;
        const usd = isUsd ? raw : raw / rate;
        pushExpense(key, uzs, usd, exp?.category ?? "—");
      }
    }

    let salariesTotalUzs = 0;
    const salariesLabel = t("finance.pnl.salaries");
    for (const s of salaries) {
      const y = String(s.year);
      ySet.add(y);
      if (year !== "all" && y !== year) continue;
      if (months.length > 0 && !months.includes(s.month)) continue;
      const key = `${y}-${String(s.month).padStart(2, "0")}`;
      const rate = getRate(key);
      const uzs = Number(s.fixed_amount) + Number(s.kpi_amount) - Number(s.penalty_amount);
      const usd = uzs / rate;
      pushExpense(key, uzs, usd, salariesLabel);
      add(salariesByMonth, key, { uzs, usd });
      salariesTotalUzs += uzs;
    }

    return {
      revenueByMonth, expenseByMonth, docCostsByMonth, expenseByCat, salariesTotalUzs,
      contractsCountByMonth, salariesByMonth,
      allYears: Array.from(ySet).sort(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, expenses, payments, salaries, basis, year, months, getRate, lang]);

  void expenseUzs; void paymentUzs; void salariesTotalUzs;

  const pick = (p: { uzs: number; usd: number } | undefined) =>
    p ? (currency === "UZS" ? p.uzs : p.usd) : 0;

  const allMonths = useMemo(() => {
    const s = new Set<string>([
      ...revenueByMonth.keys(),
      ...expenseByMonth.keys(),
      ...docCostsByMonth.keys(),
    ]);
    return Array.from(s).sort();
  }, [revenueByMonth, expenseByMonth, docCostsByMonth]);

  const chartData = useMemo(() => {
    return allMonths.map((k) => {
      const [y, mm] = k.split("-");
      const rev = pick(revenueByMonth.get(k));
      const exp = pick(expenseByMonth.get(k));
      const doc = pick(docCostsByMonth.get(k));
      return {
        name: `${MONTHS[Number(mm) - 1].slice(0, 3)} ${y.slice(2)}`,
        revenue: Math.round(rev),
        expense: Math.round(exp),
        // Sof foyda = Jami daromad − Doc xarajat − Boshqa xarajatlar
        profit: Math.round(rev - doc - exp),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMonths, revenueByMonth, expenseByMonth, docCostsByMonth, currency]);

  const sumPair = (m: Map<string, { uzs: number; usd: number }>) =>
    Array.from(m.values()).reduce((s, v) => ({ uzs: s.uzs + v.uzs, usd: s.usd + v.usd }), { uzs: 0, usd: 0 });

  const totals = useMemo(() => {
    const revP = sumPair(revenueByMonth);
    const expP = sumPair(expenseByMonth);
    const docP = sumPair(docCostsByMonth);
    const revenue = pick(revP);
    const expense = pick(expP);
    const docCosts = pick(docP);
    const grossProfit = revenue - docCosts;
    const profit = revenue - docCosts - expense;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, expense, docCosts, grossProfit, profit, margin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueByMonth, expenseByMonth, docCostsByMonth, currency]);

  const expenseCategories = useMemo(() => {
    return Array.from(expenseByCat.entries())
      .map(([name, p]) => ({ name, total: pick(p) }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseByCat, currency]);

  const topExpenses = expenseCategories.slice(0, 10);

  const periodLabel = `${year === "all" ? t("common.allYears") : year}${months.length ? " · " + months.map(m => MONTHS[m-1]).join(", ") : ""}`;
  const basisLabel = basis === "accrual" ? t("finance.basis.accrual") : t("finance.basis.cash");

  function buildReportRows() {
    const head = ["", ...allMonths.map(k => {
      const [y, mm] = k.split("-");
      return `${MONTHS[Number(mm)-1].slice(0,3)} ${y.slice(2)}`;
    }), t("common.total")];
    const rev = allMonths.map((k) => pick(revenueByMonth.get(k)));
    const doc = allMonths.map((k) => pick(docCostsByMonth.get(k)));
    const exp = allMonths.map((k) => pick(expenseByMonth.get(k)));
    const sal = allMonths.map((k) => pick(salariesByMonth.get(k)));
    const cnt = allMonths.map((k) => contractsCountByMonth.get(k) ?? 0);
    const gp = rev.map((r, i) => r - doc[i]);
    const np = rev.map((r, i) => r - doc[i] - exp[i]);
    const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
    const round = (a: number[]) => a.map(v => Math.round(v));
    const rows: (string | number)[][] = [
      [t("finance.pnl.revenue"), ...round(rev), Math.round(sum(rev))],
      [t("finance.pnl.docCosts"), ...round(doc), Math.round(sum(doc))],
      [t("finance.pnl.grossProfit"), ...round(gp), Math.round(sum(gp))],
      [t("finance.pnl.salaries"), ...round(sal), Math.round(sum(sal))],
      [t("finance.pnl.expensesBreakdown"), ...round(exp), Math.round(sum(exp))],
      [t("finance.pnl.netProfit"), ...round(np), Math.round(sum(np))],
      [t("finance.contracts"), ...cnt, sum(cnt)],
    ];
    return { head, rows };
  }

  const exportExcel = () => {
    const { head, rows } = buildReportRows();
    const wb = XLSX.utils.book_new();
    const meta = [
      [t("finance.title")],
      [t("finance.basis"), basisLabel],
      [t("finance.currency"), currency],
      [t("common.year"), year === "all" ? t("common.allYears") : year],
      [t("finance.months"), months.length ? months.map(m => MONTHS[m-1]).join(", ") : t("common.allMonths")],
      [],
      [t("finance.revenue"), Math.round(totals.revenue)],
      [t("finance.pnl.docCosts"), Math.round(totals.docCosts)],
      [t("finance.grossProfit"), Math.round(totals.grossProfit)],
      [t("finance.expense"), Math.round(totals.expense)],
      [t("finance.profit"), Math.round(totals.profit)],
      [t("finance.margin"), `${totals.margin.toFixed(1)}%`],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(meta);
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");

    const ws2 = XLSX.utils.aoa_to_sheet([head, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws2, "Monthly");

    const catRows = [[t("finance.category"), t("common.amount")], ...expenseCategories.map(c => [c.name, Math.round(c.total)])];
    const ws3 = XLSX.utils.aoa_to_sheet(catRows);
    XLSX.utils.book_append_sheet(wb, ws3, "Categories");

    XLSX.writeFile(wb, `moliya-${basis}-${currency}-${year}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(t("finance.title"), 40, 40);
    doc.setFontSize(10);
    doc.text(`${basisLabel} · ${currency} · ${periodLabel}`, 40, 58);

    autoTable(doc, {
      startY: 75,
      head: [[t("finance.pnl.line"), t("common.amount"), "%"]],
      body: [
        [t("finance.pnl.revenue"), fmt(totals.revenue), "100.0%"],
        [t("finance.pnl.docCosts"), fmt(totals.docCosts), totals.revenue > 0 ? `${((totals.docCosts/totals.revenue)*100).toFixed(1)}%` : "0.0%"],
        [t("finance.pnl.grossProfit"), fmt(totals.grossProfit), totals.revenue > 0 ? `${((totals.grossProfit/totals.revenue)*100).toFixed(1)}%` : "0.0%"],
        [t("finance.pnl.expensesBreakdown"), fmt(totals.expense), totals.revenue > 0 ? `${((totals.expense/totals.revenue)*100).toFixed(1)}%` : "0.0%"],
        [t("finance.pnl.netProfit"), fmt(totals.profit), `${totals.margin.toFixed(1)}%`],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241] },
    });

    const { head, rows } = buildReportRows();
    autoTable(doc, {
      head: [head],
      body: rows.map(r => r.map((c, i) => i === 0 ? String(c) : (typeof c === "number" ? fmtShort(c) : String(c)))),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [99, 102, 241] },
    });

    if (expenseCategories.length) {
      autoTable(doc, {
        head: [[t("finance.category"), t("common.amount"), "%"]],
        body: expenseCategories.map(c => [c.name, fmt(c.total), totals.expense > 0 ? `${((c.total/totals.expense)*100).toFixed(1)}%` : "0.0%"]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [99, 102, 241] },
      });
    }

    doc.save(`moliya-${basis}-${currency}-${year}.pdf`);
  };


  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="relative z-10 md:pl-56">
        <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-[1500px] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ background: "var(--gradient-primary)" }}
              >
                <LineChartIcon className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">{t("finance.title")}</h1>
                <p className="text-xs text-muted-foreground">{t("finance.subtitle")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportExcel}
                className="h-9 px-3 rounded-md border border-border bg-card hover:bg-secondary flex items-center gap-1.5 text-xs font-medium"
                title="Excel"
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
              <button
                onClick={exportPdf}
                className="h-9 px-3 rounded-md border border-border bg-card hover:bg-secondary flex items-center gap-1.5 text-xs font-medium"
                title="PDF"
              >
                <FileText className="h-4 w-4" /> PDF
              </button>
              {isAdmin && (
                <Link to="/admin" className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center" title={t("nav.admin")}>
                  <Shield className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
                className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center"
                title={t("common.logout")}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-6 py-6 space-y-6">
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("finance.basis")}</label>
                <div className="flex gap-1">
                  {([
                    ["accrual", t("finance.basis.accrual")],
                    ["cash", t("finance.basis.cash")],
                  ] as const).map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setBasis(k as "accrual" | "cash")}
                      className={cn(
                        "flex-1 h-9 rounded-md border text-xs px-2 transition-colors",
                        basis === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("finance.currency")}</label>
                <div className="flex gap-1">
                  {([
                    ["UZS", t("finance.currency.uzs")],
                    ["USD", t("finance.currency.usd")],
                  ] as const).map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setCurrency(k)}
                      className={cn(
                        "flex-1 h-9 rounded-md border text-xs px-2 transition-colors",
                        currency === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("common.year")}</label>
                <Select value={year} onValueChange={(v) => { setYear(v); setMonths([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.allYears")}</SelectItem>
                    {allYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("finance.months")}</label>
                <MonthsPicker selected={months} onChange={setMonths} monthNames={MONTHS} allLabel={t("common.allMonths")} selectedLabel={t("common.selected")} clearLabel={t("common.clear")} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label={t("finance.revenue")} value={fmt(totals.revenue)} icon={<DollarSign className="h-4 w-4" />} tone="green" />
            <KpiCard label={t("finance.pnl.docCosts")} value={fmt(totals.docCosts)} icon={<Receipt className="h-4 w-4" />} />
            <KpiCard label={t("finance.grossProfit")} value={fmt(totals.grossProfit)} icon={<TrendingUp className="h-4 w-4" />} tone="green" />
            <KpiCard label={t("finance.expense")} value={fmt(totals.expense)} icon={<Receipt className="h-4 w-4" />} />
            <KpiCard
              label={t("finance.profit")}
              value={fmt(totals.profit)}
              icon={totals.profit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              tone={totals.profit >= 0 ? "green" : "red"}
              sub={`${t("finance.margin")} ${totals.margin.toFixed(1)}%`}
            />
          </div>


          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">{t("finance.profitTrend")}</div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                  <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} tickFormatter={fmtShort} />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="profit" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <ForecastCard
            contracts={contracts}
            getRate={getRate}
            currency={currency}
            fmt={fmt}
            fmtShort={fmtShort}
          />

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">{t("finance.pnl")}</div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("finance.pnl.line")}</TableHead>
                    <TableHead className="text-right">{t("common.amount")}</TableHead>
                    <TableHead className="text-right">{t("finance.pnl.share")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">{t("finance.pnl.revenue")}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(totals.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">100.0%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-muted-foreground">− {t("finance.pnl.docCosts")}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totals.docCosts)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {totals.revenue > 0 ? ((totals.docCosts / totals.revenue) * 100).toFixed(1) : "0.0"}%
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-semibold">= {t("finance.pnl.grossProfit")}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(totals.grossProfit)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {totals.revenue > 0 ? ((totals.grossProfit / totals.revenue) * 100).toFixed(1) : "0.0"}%
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t-2">
                    <TableCell className="font-medium">{t("finance.pnl.expensesBreakdown")}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(totals.expense)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {totals.revenue > 0 ? ((totals.expense / totals.revenue) * 100).toFixed(1) : "0.0"}%
                    </TableCell>
                  </TableRow>
                  {expenseCategories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-3 text-xs">
                        {t("common.noData")}
                      </TableCell>
                    </TableRow>
                  ) : expenseCategories.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell className="pl-6 text-muted-foreground">− {c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {totals.revenue > 0 ? ((c.total / totals.revenue) * 100).toFixed(1) : "0.0"}%
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-bold">= {t("finance.pnl.netProfit")}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-bold", totals.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                      {fmt(totals.profit)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums font-bold", totals.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                      {totals.margin.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Monthly comparison — CFO view */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">{t("finance.monthlyComparison")}</div>
              <div className="text-[11px] text-muted-foreground">{allMonths.length} {t("finance.months")}</div>
            </div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card z-10 min-w-[200px]">{t("finance.metric")}</TableHead>
                    {allMonths.map((k) => {
                      const [y, mm] = k.split("-");
                      return (
                        <TableHead key={k} className="text-right whitespace-nowrap">
                          {MONTH_ORDER[Number(mm) - 1].slice(0, 3)} {y.slice(2)}
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-right font-bold bg-muted/30">{t("common.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const rev = allMonths.map((k) => pick(revenueByMonth.get(k)));
                    const doc = allMonths.map((k) => pick(docCostsByMonth.get(k)));
                    const exp = allMonths.map((k) => pick(expenseByMonth.get(k)));
                    const sal = allMonths.map((k) => pick(salariesByMonth.get(k)));
                    const cnt = allMonths.map((k) => contractsCountByMonth.get(k) ?? 0);
                    const gp = rev.map((r, i) => r - doc[i]);
                    const np = rev.map((r, i) => r - doc[i] - exp[i]);
                    const margin = rev.map((r, i) => r > 0 ? (np[i] / r) * 100 : 0);
                    const arpu = rev.map((r, i) => cnt[i] > 0 ? r / cnt[i] : 0);
                    const opexRatio = rev.map((r, i) => r > 0 ? (exp[i] / r) * 100 : 0);
                    const mom = np.map((v, i) => i === 0 ? null : (np[i - 1] !== 0 ? ((v - np[i - 1]) / Math.abs(np[i - 1])) * 100 : null));
                    let cum = 0;
                    const cumNp = np.map((v) => (cum += v));

                    const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
                    const totalRev = sum(rev);
                    const totalCnt = sum(cnt);

                    const rows: Array<{
                      label: string;
                      values: (number | null)[];
                      total: number | string;
                      kind?: "money" | "count" | "pct";
                      bold?: boolean;
                      tone?: "green" | "red" | "muted";
                      border?: boolean;
                    }> = [
                      { label: t("finance.pnl.revenue"), values: rev, total: sum(rev), kind: "money", bold: true, tone: "green" },
                      { label: t("finance.pnl.docCosts"), values: doc, total: sum(doc), kind: "money", tone: "muted" },
                      { label: t("finance.pnl.grossProfit"), values: gp, total: sum(gp), kind: "money", bold: true, border: true },
                      { label: t("finance.pnl.salaries"), values: sal, total: sum(sal), kind: "money", tone: "muted" },
                      { label: t("finance.pnl.expensesBreakdown"), values: exp, total: sum(exp), kind: "money", tone: "muted" },
                      { label: t("finance.pnl.netProfit"), values: np, total: sum(np), kind: "money", bold: true, border: true },
                      { label: t("finance.margin"), values: margin, total: totalRev > 0 ? (sum(np) / totalRev) * 100 : 0, kind: "pct", border: true },
                      { label: t("finance.momGrowth"), values: mom, total: "—", kind: "pct" },
                      { label: t("finance.cumNetProfit"), values: cumNp, total: cumNp[cumNp.length - 1] ?? 0, kind: "money", tone: "green" },
                      { label: t("finance.contracts"), values: cnt, total: totalCnt, kind: "count", border: true },
                      { label: t("finance.arpu"), values: arpu, total: totalCnt > 0 ? totalRev / totalCnt : 0, kind: "money" },
                      { label: t("finance.opexRatio"), values: opexRatio, total: totalRev > 0 ? (sum(exp) / totalRev) * 100 : 0, kind: "pct" },
                    ];

                    const fmtCell = (v: number | null, kind: "money" | "count" | "pct" | undefined) => {
                      if (v === null || v === undefined) return "—";
                      if (kind === "count") return String(Math.round(v));
                      if (kind === "pct") return `${v.toFixed(1)}%`;
                      return fmt(v);
                    };
                    const toneCls = (tone: "green" | "red" | "muted" | undefined, v: number | null) => {
                      if (v !== null && v !== undefined && typeof v === "number") {
                        if (tone === "green" || (v > 0 && tone === undefined)) return v < 0 ? "text-destructive" : "";
                      }
                      if (v !== null && v !== undefined && v < 0) return "text-destructive";
                      if (tone === "muted") return "text-muted-foreground";
                      return "";
                    };

                    return rows.map((row, ri) => (
                      <TableRow key={ri} className={cn(row.border && "border-t-2", row.bold && "bg-muted/20")}>
                        <TableCell className={cn("sticky left-0 bg-card z-10", row.bold && "font-semibold")}>{row.label}</TableCell>
                        {row.values.map((v, i) => (
                          <TableCell key={i} className={cn("text-right tabular-nums whitespace-nowrap text-xs", toneCls(row.tone, v as number | null), row.bold && "font-semibold")}>
                            {fmtCell(v as number | null, row.kind)}
                            {row.label.includes("MoM") && typeof v === "number" && (
                              <span className={cn("ml-1", v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                                {v >= 0 ? "▲" : "▼"}
                              </span>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className={cn("text-right tabular-nums font-bold bg-muted/30 whitespace-nowrap", typeof row.total === "number" && row.total < 0 && "text-destructive")}>
                          {typeof row.total === "string" ? row.total : fmtCell(row.total, row.kind)}
                        </TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">{t("finance.topCategories")}</div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("finance.category")}</TableHead>
                    <TableHead className="text-right">{t("common.amount")}</TableHead>
                    <TableHead className="text-right">{t("finance.percent")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topExpenses.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">{t("common.noData")}</TableCell></TableRow>
                  ) : topExpenses.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell><Badge variant="outline">{c.name}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {totals.expense > 0 ? ((c.total / totals.expense) * 100).toFixed(1) : "0.0"}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <div className="text-xs text-muted-foreground text-center pb-4">
            {basis === "accrual" ? t("finance.note.accrual") : t("finance.note.cash")}
          </div>
        </main>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, icon, tone, sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "green" | "red";
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={cn(
          tone === "green" && "text-emerald-600 dark:text-emerald-400",
          tone === "red" && "text-destructive"
        )}>{icon}</span>
      </div>
      <div className={cn(
        "mt-1 text-lg font-bold tabular-nums",
        tone === "green" && "text-emerald-600 dark:text-emerald-400",
        tone === "red" && "text-destructive"
      )}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function MonthsPicker({
  selected, onChange, monthNames, allLabel, selectedLabel, clearLabel,
}: { selected: number[]; onChange: (v: number[]) => void; monthNames: string[]; allLabel: string; selectedLabel: string; clearLabel: string }) {
  const toggle = (m: number) =>
    onChange(selected.includes(m) ? selected.filter((s) => s !== m) : [...selected, m]);
  const label =
    selected.length === 0 ? allLabel
    : selected.length === 1 ? monthNames[selected[0] - 1]
    : `${selected.length} ${selectedLabel}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 h-9 text-sm hover:bg-accent/30"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        <div className="grid grid-cols-2 gap-1">
          {monthNames.map((mLabel, i) => {
            const v = i + 1;
            const checked = selected.includes(v);
            return (
              <label key={v} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/30 cursor-pointer">
                <Checkbox checked={checked} onCheckedChange={() => toggle(v)} />
                <span className="text-xs">{mLabel}</span>
              </label>
            );
          })}
        </div>
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="w-full text-xs text-muted-foreground mt-2 py-1 rounded hover:bg-accent/30"
          >
            {clearLabel}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function parseContractDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

// ============================================================
// Visa sales forecast (next 3 months) — auto-updates from contracts
// ============================================================

type FcastPoint = {
  name: string;
  actual?: number;
  forecast?: number;
  low?: number;
  high?: number;
};

function buildRevenueHistory(
  contracts: Contract[],
  getRate: (ym: string) => number,
  currency: "UZS" | "USD",
): { key: string; value: number }[] {
  const map = new Map<string, number>();
  for (const c of contracts) {
    const p = dashboardPeriod(c);
    if (!p) continue;
    const gross = contractGrossUsd(c, getRate, p.key);
    const v = currency === "USD" ? gross : gross * getRate(p.key);
    map.set(p.key, (map.get(p.key) || 0) + v);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));
}

function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m, 1); // next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function forecastNext3(history: { key: string; value: number }[]): {
  forecast: { key: string; value: number; low: number; high: number }[];
  method: string;
} {
  if (history.length === 0) {
    return { forecast: [], method: "Ma'lumot yo'q" };
  }
  // exclude trailing zeros (no activity months at the end) but keep internal zeros
  const last = history[history.length - 1];
  const vals = history.map(h => h.value);

  // Weighted moving average (last 3 months: 0.2, 0.3, 0.5)
  const last3 = vals.slice(-3);
  const weights = last3.length === 3 ? [0.2, 0.3, 0.5] : last3.map(() => 1 / last3.length);
  const wma = last3.reduce((s, v, i) => s + v * weights[i], 0);

  // Linear trend (slope across last up to 6 months)
  const trendWindow = vals.slice(-6);
  let slope = 0;
  if (trendWindow.length >= 2) {
    const n = trendWindow.length;
    const xMean = (n - 1) / 2;
    const yMean = trendWindow.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    trendWindow.forEach((y, x) => {
      num += (x - xMean) * (y - yMean);
      den += (x - xMean) ** 2;
    });
    slope = den > 0 ? num / den : 0;
  }

  // Seasonality: same month last year / 12-month avg (if ≥12 months)
  const histMap = new Map(history.map(h => [h.key, h.value]));
  const has12 = history.length >= 12;
  const avg12 = has12
    ? vals.slice(-12).reduce((s, v) => s + v, 0) / 12
    : 0;

  let method = "Vaznli o'rtacha + trend";
  if (has12) method += " + mavsumiylik";

  const out: { key: string; value: number; low: number; high: number }[] = [];
  let cursor = last.key;
  for (let i = 1; i <= 3; i++) {
    cursor = nextMonthKey(cursor);
    let base = wma + slope * i;

    if (has12) {
      // same month previous year
      const [y, m] = cursor.split("-").map(Number);
      const prevKey = `${y - 1}-${String(m).padStart(2, "0")}`;
      const prev = histMap.get(prevKey);
      if (prev !== undefined && avg12 > 0) {
        const seasonalFactor = prev / avg12;
        base = base * 0.6 + (avg12 * seasonalFactor + slope * i) * 0.4;
      }
    }

    base = Math.max(0, base);
    out.push({
      key: cursor,
      value: base,
      low: Math.max(0, base * 0.85),
      high: base * 1.15,
    });
  }
  return { forecast: out, method };
}

function ForecastCard({
  contracts, getRate, currency, fmt: fmtFn, fmtShort: fmtShortFn,
}: {
  contracts: Contract[];
  getRate: (ym: string) => number;
  currency: "UZS" | "USD";
  fmt: (n: number) => string;
  fmtShort: (n: number) => string;
}) {
  const history = useMemo(
    () => buildRevenueHistory(contracts, getRate, currency),
    [contracts, getRate, currency],
  );
  const { forecast, method } = useMemo(() => forecastNext3(history), [history]);

  const chartData: FcastPoint[] = useMemo(() => {
    const tail = history.slice(-6);
    const points: FcastPoint[] = tail.map(h => {
      const [y, mm] = h.key.split("-");
      return {
        name: `${MONTH_ORDER[Number(mm) - 1].slice(0, 3)} ${y.slice(2)}`,
        actual: Math.round(h.value),
      };
    });
    // bridge actual → forecast
    if (tail.length > 0 && forecast.length > 0) {
      points[points.length - 1].forecast = points[points.length - 1].actual;
    }
    forecast.forEach(f => {
      const [y, mm] = f.key.split("-");
      points.push({
        name: `${MONTH_ORDER[Number(mm) - 1].slice(0, 3)} ${y.slice(2)} •`,
        forecast: Math.round(f.value),
        low: Math.round(f.low),
        high: Math.round(f.high),
      });
    });
    return points;
  }, [history, forecast]);

  const lastActual = history[history.length - 1]?.value ?? 0;
  const totalForecast = forecast.reduce((s, f) => s + f.value, 0);
  const totalLow = forecast.reduce((s, f) => s + f.low, 0);
  const totalHigh = forecast.reduce((s, f) => s + f.high, 0);
  const firstFc = forecast[0]?.value ?? 0;
  const growth = lastActual > 0 ? ((firstFc - lastActual) / lastActual) * 100 : 0;

  if (history.length < 2) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Sotuv prognozi (kelasi 3 oy)</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Prognoz uchun kamida 2 oy ma'lumot kerak. Hozir: {history.length} oy.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Sotuv prognozi — kelasi 3 oy</span>
          <Badge variant="secondary" className="text-[10px]">{method}</Badge>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {history.length} oy tarix · avto-yangilanadi
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border p-3">
          <div className="text-[11px] text-muted-foreground">Realist (3 oy)</div>
          <div className="text-base font-bold tabular-nums">{fmtFn(totalForecast)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-[11px] text-muted-foreground">Pessimist</div>
          <div className="text-base font-bold tabular-nums text-red-600 dark:text-red-400">{fmtFn(totalLow)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-[11px] text-muted-foreground">Optimist</div>
          <div className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtFn(totalHigh)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-[11px] text-muted-foreground">Kelasi oy o'sish</div>
          <div className={cn(
            "text-base font-bold tabular-nums flex items-center gap-1",
            growth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          )}>
            {growth >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
            <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} tickFormatter={fmtShortFn} />
            <Tooltip
              formatter={(v: number) => fmtFn(v)}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="Haqiqiy" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="forecast" name="Prognoz (realist)" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="high" name="Optimist" stroke="#10b981" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.5} />
            <Line type="monotone" dataKey="low" name="Pessimist" stroke="#ef4444" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oy</TableHead>
              <TableHead className="text-right">Pessimist</TableHead>
              <TableHead className="text-right">Realist</TableHead>
              <TableHead className="text-right">Optimist</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecast.map(f => {
              const [y, mm] = f.key.split("-");
              return (
                <TableRow key={f.key}>
                  <TableCell className="font-medium">{MONTH_ORDER[Number(mm) - 1]} {y}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">{fmtFn(f.low)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtFn(f.value)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtFn(f.high)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="text-[11px] text-muted-foreground mt-3">
        Prognoz oxirgi 3 oy vaznli o'rtachasi + trend{history.length >= 12 ? " + mavsumiy koeffitsient" : ""} asosida hisoblanadi. Yangi shartnoma kiritilsa, prognoz avtomatik yangilanadi.
      </div>
    </Card>
  );
}
