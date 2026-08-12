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
  ComposedChart, Bar, Area, PieChart, Pie, Cell,
} from "recharts";
import { LineChart as LineChartIcon, LogOut, Shield, ChevronDown, TrendingUp, TrendingDown, DollarSign, Receipt, FileSpreadsheet, FileText, Sparkles, Printer, Download, Wallet, Award, Activity, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo.png";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { supabase } from "@/integrations/supabase/client";
import { getContracts, type Contract } from "@/lib/contracts.functions";
import { useUsdRates } from "@/lib/usd-rates";
import { useT, getMonthNames } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FinanceInsights } from "@/components/finance-insights";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportReceivablesPdf } from "@/lib/receivables-pdf";


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
  const [pdfExporting, setPdfExporting] = useState(false);
  const fmt = useMemo(() => makeFmt(currency), [currency]);
  const canAccessFinance = !!user && !permsLoading && can("finance_section");

  const fetchContracts = useServerFn(getContracts);
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => fetchContracts(),
    enabled: canAccessFinance,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["finance-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses").select("id, category, total_amount, currency, expense_date");
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
    enabled: canAccessFinance,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["finance-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_payments").select("expense_id, amount, paid_at");
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
    enabled: canAccessFinance,
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
    enabled: canAccessFinance,
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

  // ---------- Extra KPIs & YoY comparison ----------
  const extras = useMemo(() => {
    const n = allMonths.length || 1;
    const avgRev = totals.revenue / n;
    const burn = totals.expense / n; // avg monthly opex
    const avgProfit = totals.profit / n;
    // Best month by net profit
    let bestKey = ""; let bestVal = -Infinity;
    for (const k of allMonths) {
      const r = pick(revenueByMonth.get(k));
      const d = pick(docCostsByMonth.get(k));
      const e = pick(expenseByMonth.get(k));
      const np = r - d - e;
      if (np > bestVal) { bestVal = np; bestKey = k; }
    }
    // Runway (months) — if profit negative, cash/burn (we don't have cash balance, so use last-12 profit as proxy buffer)
    const bufferMonths = burn > 0 && avgProfit < 0 ? Math.abs(totals.profit) / burn : null;
    // YoY: sum current filtered vs same months previous year (from full history without year filter)
    const prevRev = new Map<string, number>();
    const prevExp = new Map<string, number>();
    // rebuild simple prev-year aggregates from source data
    for (const c of contracts) {
      const p = dashboardPeriod(c);
      if (!p) continue;
      if (basis === "cash" && !isFullyPaid(c)) continue;
      const gross = contractGrossUsd(c, getRate, p.key);
      const val = currency === "USD" ? gross : gross * getRate(p.key);
      prevRev.set(p.key, (prevRev.get(p.key) ?? 0) + val);
    }
    for (const e of expenses) {
      const key = e.expense_date.slice(0, 7);
      const rate = getRate(key);
      const raw = Number(e.total_amount);
      const val = currency === "USD"
        ? (e.currency === "USD" ? raw : raw / rate)
        : (e.currency === "USD" ? raw * rate : raw);
      prevExp.set(key, (prevExp.get(key) ?? 0) + val);
    }
    let yoyRevPrev = 0, yoyExpPrev = 0, yoyRevCur = 0, yoyExpCur = 0;
    for (const k of allMonths) {
      const [y, mm] = k.split("-");
      const prevK = `${Number(y) - 1}-${mm}`;
      yoyRevCur += prevRev.get(k) ?? 0;
      yoyExpCur += prevExp.get(k) ?? 0;
      yoyRevPrev += prevRev.get(prevK) ?? 0;
      yoyExpPrev += prevExp.get(prevK) ?? 0;
    }
    const yoyRevGrowth = yoyRevPrev > 0 ? ((yoyRevCur - yoyRevPrev) / yoyRevPrev) * 100 : null;
    const yoyProfitPrev = yoyRevPrev - yoyExpPrev;
    const yoyProfitCur = yoyRevCur - yoyExpCur;
    const yoyProfitGrowth = yoyProfitPrev !== 0 ? ((yoyProfitCur - yoyProfitPrev) / Math.abs(yoyProfitPrev)) * 100 : null;
    return {
      avgRev, burn, avgProfit,
      bestKey, bestVal,
      bufferMonths,
      yoyRevPrev, yoyRevCur, yoyRevGrowth,
      yoyExpPrev, yoyExpCur,
      yoyProfitPrev, yoyProfitCur, yoyProfitGrowth,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMonths, totals, contracts, expenses, basis, currency, getRate]);

  const PIE_COLORS = [
    "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
    "var(--primary)", "var(--accent)", "var(--secondary)", "var(--muted-foreground)", "var(--destructive)",
  ];

  const exportCsv = () => {
    const { head, rows } = buildReportRows();
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `moliya-${basis}-${currency}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const exportPdf = async () => {
    if (pdfExporting) return;
    const el = document.getElementById("moliya-pdf-root");
    if (!el) return;
    const toastId = toast.loading("PDF tayyorlanmoqda...");
    setPdfExporting(true);
    try {
      const { exportElementToPdf } = await import("@/lib/pdf-export");
      await exportElementToPdf(el, {
        filename: `moliya-${basis}-${currency}-${year}.pdf`,
        title: t("finance.title"),
        subtitle: `${basisLabel}  ·  ${currency}  ·  ${periodLabel}`,
        meta: "Moliyaviy hisobot",
      });
      toast.success("PDF tayyor — preview oynasidan yuklab oling", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("PDF yaratishda xatolik. Sahifani yangilab qayta urinib ko'ring.", { id: toastId });
    } finally {
      setPdfExporting(false);
    }
  };




  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.35] print:hidden"
        style={{
          background:
            "radial-gradient(60rem 30rem at 15% -10%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 60%), radial-gradient(50rem 26rem at 100% 0%, color-mix(in oklch, var(--chart-2) 18%, transparent), transparent 60%)",
        }}
      />
      <AppSidebar />
      <div className="relative z-10 md:pl-56">
        <header className="border-b border-border/70 bg-card/60 backdrop-blur-xl sticky top-0 z-20 shadow-sm">
          <div className="mx-auto max-w-[1500px] px-4 sm:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 pl-10 md:pl-0">
              <div
                className="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-primary/20"
                style={{ background: "var(--gradient-primary)" }}
              >
                <LineChartIcon className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold tracking-tight">{t("finance.title")}</h1>
                <p className="text-[11px] md:text-xs text-muted-foreground">{t("finance.subtitle")}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={exportExcel}
                className="h-9 px-2 md:px-3 rounded-lg border border-border/70 bg-card/70 hover:bg-secondary hover:border-primary/40 transition-colors flex items-center gap-1.5 text-xs font-medium"
                title="Excel"
              >
                <FileSpreadsheet className="h-4 w-4" /> <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                onClick={exportCsv}
                className="h-9 px-2 md:px-3 rounded-lg border border-border/70 bg-card/70 hover:bg-secondary hover:border-primary/40 transition-colors flex items-center gap-1.5 text-xs font-medium"
                title="CSV"
              >
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                onClick={exportPdf}
                disabled={pdfExporting}
                className="h-9 px-2 md:px-3 rounded-lg border border-border/70 bg-card/70 hover:bg-secondary hover:border-primary/40 transition-colors flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                title="PDF"
              >
                {pdfExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                <span className="hidden sm:inline">{pdfExporting ? "Tayyorlanmoqda" : "PDF"}</span>
              </button>
              <button
                onClick={() => window.print()}
                className="h-9 px-2 md:px-3 rounded-lg border border-border/70 bg-card/70 hover:bg-secondary hover:border-primary/40 transition-colors flex items-center gap-1.5 text-xs font-medium"
                title="Print"
              >
                <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print</span>
              </button>
              {isAdmin && (
                <Link to="/admin" className="h-9 w-9 rounded-lg border border-border/70 bg-card/70 hover:bg-secondary hover:border-primary/40 transition-colors flex items-center justify-center" title={t("nav.admin")}>
                  <Shield className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
                className="h-9 w-9 rounded-lg border border-border/70 bg-card/70 hover:bg-secondary hover:border-primary/40 transition-colors flex items-center justify-center"
                title={t("common.logout")}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main id="moliya-pdf-root" className="mx-auto max-w-[1500px] px-4 sm:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
          <Card className="p-4 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm">
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
            <KpiCard label={t("finance.pnl.docCosts")} value={fmt(totals.docCosts)} icon={<Receipt className="h-4 w-4" />} tone="amber" />
            <KpiCard label={t("finance.grossProfit")} value={fmt(totals.grossProfit)} icon={<TrendingUp className="h-4 w-4" />} tone="blue" />
            <KpiCard label={t("finance.expense")} value={fmt(totals.expense)} icon={<Receipt className="h-4 w-4" />} tone="red" />
            <KpiCard
              label={t("finance.profit")}
              value={fmt(totals.profit)}
              icon={totals.profit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              tone={totals.profit >= 0 ? "green" : "red"}
              sub={`${t("finance.margin")} ${totals.margin.toFixed(1)}%`}
            />
          </div>

          {/* Advanced KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="O'rtacha oylik daromad"
              value={fmt(extras.avgRev)}
              icon={<Activity className="h-4 w-4" />}
              tone="blue"
              sub={`${allMonths.length} oy asosida`}
            />
            <KpiCard
              label="Burn rate (o'rt. xarajat/oy)"
              value={fmt(extras.burn)}
              icon={<Wallet className="h-4 w-4" />}
              tone="red"
              sub={extras.bufferMonths !== null ? `Zaxira: ${extras.bufferMonths.toFixed(1)} oy` : "Foyda musbat"}
            />

            <KpiCard
              label="Eng yaxshi oy"
              value={extras.bestKey ? `${MONTHS[Number(extras.bestKey.split("-")[1]) - 1].slice(0,3)} ${extras.bestKey.split("-")[0].slice(2)}` : "—"}
              icon={<Award className="h-4 w-4" />}
              tone="green"
              sub={extras.bestVal > -Infinity ? fmt(extras.bestVal) : ""}
            />
            <KpiCard
              label="YoY daromad o'sishi"
              value={extras.yoyRevGrowth === null ? "—" : `${extras.yoyRevGrowth >= 0 ? "+" : ""}${extras.yoyRevGrowth.toFixed(1)}%`}
              icon={extras.yoyRevGrowth !== null && extras.yoyRevGrowth >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              tone={extras.yoyRevGrowth === null ? undefined : extras.yoyRevGrowth >= 0 ? "green" : "red"}
              sub={extras.yoyRevPrev > 0 ? `O'tgan yil: ${fmt(extras.yoyRevPrev)}` : "O'tgan yil ma'lumot yo'q"}
            />
          </div>

          <Card className="p-4 md:p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2 before:h-4 before:w-1 before:rounded-full before:bg-primary">Daromad, xarajat va sof foyda</div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                  <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} tickFormatter={fmtShort} />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="currentColor" opacity={0.3} />
                  <Bar dataKey="revenue" name="Daromad" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Xarajat" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="profit" name="Sof foyda" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* YoY comparison */}
          {(extras.yoyRevPrev > 0 || extras.yoyExpPrev > 0) && (
            <Card className="p-4 md:p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <div className="text-sm font-semibold mb-3 flex items-center gap-2 before:h-4 before:w-1 before:rounded-full before:bg-primary">Yildan-yilga taqqoslash (tanlangan oylar)</div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ko'rsatkich</TableHead>
                      <TableHead className="text-right">O'tgan yil</TableHead>
                      <TableHead className="text-right">Joriy</TableHead>
                      <TableHead className="text-right">Farq</TableHead>
                      <TableHead className="text-right">O'sish %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { label: "Daromad", prev: extras.yoyRevPrev, cur: extras.yoyRevCur },
                      { label: "Xarajat", prev: extras.yoyExpPrev, cur: extras.yoyExpCur, invert: true },
                      { label: "Sof foyda", prev: extras.yoyProfitPrev, cur: extras.yoyProfitCur, bold: true },
                    ].map((r) => {
                      const diff = r.cur - r.prev;
                      const pct = r.prev !== 0 ? (diff / Math.abs(r.prev)) * 100 : null;
                      const good = r.invert ? diff < 0 : diff >= 0;
                      return (
                        <TableRow key={r.label}>
                          <TableCell className={cn(r.bold && "font-semibold")}>{r.label}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.prev)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(r.cur)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                            {diff >= 0 ? "+" : ""}{fmt(diff)}
                          </TableCell>
                          <TableCell className={cn("text-right tabular-nums font-medium", good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                            {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          <Card className="p-4 md:p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2 before:h-4 before:w-1 before:rounded-full before:bg-primary">{t("finance.profitTrend")}</div>
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
                  <ReferenceLine y={0} stroke="currentColor" opacity={0.3} />
                  <Line type="monotone" dataKey="profit" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} />
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

          <Card className="p-4 md:p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2 before:h-4 before:w-1 before:rounded-full before:bg-primary">{t("finance.pnl")}</div>
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
          <Card className="p-4 md:p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
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
                          {MONTHS[Number(mm) - 1].slice(0, 3)} {y.slice(2)}
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

          <Card className="p-4 md:p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2 before:h-4 before:w-1 before:rounded-full before:bg-primary">{t("finance.topCategories")}</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {topExpenses.length > 0 && (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={topExpenses} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2}>
                        {topExpenses.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
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
                    ) : topExpenses.map((c, i) => (
                      <TableRow key={c.name}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <Badge variant="outline">{c.name}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {totals.expense > 0 ? ((c.total / totals.expense) * 100).toFixed(1) : "0.0"}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Card>

          <FinanceInsights
            contracts={contracts}
            expenses={expenses}
            payments={payments}
            year={year}
            months={months}
            basis={basis}
            currency={currency}
            getRate={getRate}
            fmt={fmt}
            monthNames={MONTHS}
            t={t as (k: string) => string}
          />

          <AgedReceivablesCard contracts={contracts} t={t} />

          <div className="text-xs text-muted-foreground text-center pb-4">
            {basis === "accrual" ? t("finance.note.accrual") : t("finance.note.cash")}
          </div>

        </main>
      </div>
    </div>
  );
}

const KPI_TONES = {
  green: {
    accent: "bg-emerald-500",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    value: "text-emerald-600 dark:text-emerald-400",
    glow: "hover:border-emerald-500/40",
  },
  red: {
    accent: "bg-rose-500",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-400 ring-rose-500/20",
    value: "text-rose-600 dark:text-rose-400",
    glow: "hover:border-rose-500/40",
  },
  blue: {
    accent: "bg-sky-500",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-400 ring-sky-500/20",
    value: "text-foreground",
    glow: "hover:border-sky-500/40",
  },
  amber: {
    accent: "bg-amber-500",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    value: "text-foreground",
    glow: "hover:border-amber-500/40",
  },
  neutral: {
    accent: "bg-primary/60",
    chip: "bg-primary/10 text-primary ring-primary/20",
    value: "text-foreground",
    glow: "hover:border-primary/40",
  },
} as const;

function KpiCard({
  label, value, icon, tone, sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "green" | "red" | "blue" | "amber";
  sub?: string;
}) {
  const s = KPI_TONES[tone ?? "neutral"];
  return (
    <Card className={cn(
      "relative overflow-hidden p-4 pl-5 transition-all duration-200 border-border/70",
      "bg-card/80 backdrop-blur-sm hover:shadow-lg hover:-translate-y-0.5",
      s.glow,
    )}>
      <span className={cn("absolute inset-y-0 left-0 w-1", s.accent)} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] md:text-xs font-medium text-muted-foreground leading-tight">{label}</span>
        <span className={cn("h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ring-1", s.chip)}>{icon}</span>
      </div>
      <div className={cn("mt-2 text-lg md:text-xl font-bold tabular-nums tracking-tight", s.value)}>{value}</div>
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
      <Card className="p-4 md:p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
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
    <Card className="p-4 md:p-5 border-border/70 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
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
            <Line type="monotone" dataKey="actual" name="Haqiqiy" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="forecast" name="Prognoz (realist)" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="high" name="Optimist" stroke="var(--chart-3)" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.5} />
            <Line type="monotone" dataKey="low" name="Pessimist" stroke="var(--destructive)" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.5} />
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

// ============================================================
// Aged Receivables — buckets by days overdue
// ============================================================
function AgedReceivablesCard({ contracts, t }: { contracts: Contract[]; t: ReturnType<typeof useT>["t"] }) {
  const isCancelled = (v: string | null | undefined) => {
    const s = (v || "").trim().toLowerCase();
    return s === "bekor qilindi" || s === "cancelled" || s === "canceled" || s === "to'xtatildi" || s === "toxtatildi";
  };
  const today = new Date();
  const rows = useMemo(() => {
    return contracts
      .filter((c) => (c.remainingUsd || 0) > 0.5 && !isCancelled(c.visaResult))
      .map((c) => {
        const d = parseContractDate(c.contractDate);
        const days = d ? Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86400000)) : 0;
        let bucket: "0-30" | "31-60" | "61-90" | "90+";
        if (days <= 30) bucket = "0-30";
        else if (days <= 60) bucket = "31-60";
        else if (days <= 90) bucket = "61-90";
        else bucket = "90+";
        return { c, days, bucket };
      })
      .sort((a, b) => b.days - a.days);
  }, [contracts]);

  const buckets = [
    { key: "0-30" as const, label: "0–30 kun", tone: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { key: "31-60" as const, label: "31–60 kun", tone: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
    { key: "61-90" as const, label: "61–90 kun", tone: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
    { key: "90+" as const, label: "90+ kun", tone: "text-destructive", bg: "bg-destructive/10" },
  ];
  const summary = buckets.map((b) => {
    const items = rows.filter((r) => r.bucket === b.key);
    return { ...b, count: items.length, total: items.reduce((s, r) => s + (r.c.remainingUsd || 0), 0) };
  });
  const grand = rows.reduce((s, r) => s + (r.c.remainingUsd || 0), 0);
  const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  const [activeBucket, setActiveBucket] = useState<string>("all");
  const shown = activeBucket === "all" ? rows : rows.filter((r) => r.bucket === activeBucket);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold">Aged Receivables (Qarzdorlar yoshi)</h3>
          <p className="text-xs text-muted-foreground">
            Qarzdorlar shartnoma sanasiga qarab guruhlangan. Jami qarzdorlik: <span className="font-semibold text-foreground">{fmtUsd(grand)}</span> ({rows.length} ta)
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={async () => {
            const list = shown;
            if (!list.length) {
              toast.error("Qarzdorlar topilmadi");
              return;
            }
            try {
              await exportReceivablesPdf({
                filename: `Qarzdorlar_${activeBucket === "all" ? "Barchasi" : activeBucket.replace("+", "plus")}_${new Date().toISOString().slice(0, 10)}.pdf`,
                subtitle:
                  activeBucket === "all"
                    ? "GoForVisa - barcha qarzdorlar (aged receivables)"
                    : `GoForVisa - ${buckets.find((b) => b.key === activeBucket)?.label ?? activeBucket} guruhi`,
                buckets: summary.map((b) => ({ label: b.label, count: b.count, total: b.total })),
                rows: list.map((r) => ({
                  client: r.c.name,
                  contractNo: r.c.contractNo,
                  date: r.c.contractDate?.slice(0, 10) || "",
                  phone: r.c.phone,
                  manager: r.c.salesManager,
                  days: r.days,
                  bucket: buckets.find((b) => b.key === r.bucket)?.label ?? r.bucket,
                  totalUsd: r.c.total || 0,
                  paidUsd: r.c.paidUsd || 0,
                  remainingUsd: r.c.remainingUsd || 0,
                })),
              });
              toast.success("PDF tayyorlandi");
            } catch (e) {
              toast.error("PDF yaratishda xatolik");
            }
          }}
        >
          <FileText className="h-4 w-4" /> PDF yuklab olish
        </Button>
      </div>


      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveBucket("all")}
          className={cn("rounded-lg border p-3 text-left transition", activeBucket === "all" ? "border-primary ring-1 ring-primary/40" : "hover:bg-accent/30")}
        >
          <div className="text-xs text-muted-foreground">Barchasi</div>
          <div className="text-lg font-bold tabular-nums">{fmtUsd(grand)}</div>
          <div className="text-[11px] text-muted-foreground">{rows.length} ta</div>
        </button>
        {summary.map((b) => (
          <button
            key={b.key}
            onClick={() => setActiveBucket(b.key)}
            className={cn("rounded-lg border p-3 text-left transition", b.bg, activeBucket === b.key ? "border-primary ring-1 ring-primary/40" : "hover:opacity-90")}
          >
            <div className={cn("text-xs font-medium", b.tone)}>{b.label}</div>
            <div className="text-lg font-bold tabular-nums">{fmtUsd(b.total)}</div>
            <div className="text-[11px] text-muted-foreground">{b.count} ta</div>
          </button>
        ))}
      </div>

      <div className="rounded-lg border overflow-x-auto max-h-[420px]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Mijoz</TableHead>
              <TableHead>Shartnoma</TableHead>
              <TableHead>Sana</TableHead>
              <TableHead className="text-right">Kun</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead className="text-right">Qoldiq</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t("common.noData")}</TableCell></TableRow>
            ) : shown.slice(0, 200).map((r, i) => {
              const b = buckets.find((x) => x.key === r.bucket)!;
              return (
                <TableRow key={`${r.c.contractNo}-${i}`}>
                  <TableCell className="font-medium">{r.c.name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.c.contractNo || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.c.contractDate?.slice(0, 10) || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.days}</TableCell>
                  <TableCell><Badge variant="outline" className={b.tone}>{b.label}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-destructive">{fmtUsd(r.c.remainingUsd || 0)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {shown.length > 200 && (
        <div className="text-[11px] text-muted-foreground text-center">Ko'rsatilyapti: 200 / {shown.length}</div>
      )}
    </Card>
  );
}
