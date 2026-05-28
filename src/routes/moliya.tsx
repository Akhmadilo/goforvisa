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
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line,
} from "recharts";
import { LineChart as LineChartIcon, LogOut, Shield, ChevronDown, TrendingUp, TrendingDown, DollarSign, Receipt } from "lucide-react";
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

// Gross contract value (Jami shartnoma) in USD — matches dashboard's "Jami shartnoma".
function contractGrossUsd(c: Contract, getRate: (ym: string) => number, ym: string): number {
  if (c.priceUsd > 0) return c.priceUsd;
  if (c.priceUzs > 0) return c.priceUzs / getRate(ym);
  return 0;
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
    const ySet = new Set<string>();

    for (const c of contracts) {
      const date = parseContractDate(c.contractDate);
      if (!date) continue;
      const y = String(date.getFullYear());
      const m = date.getMonth() + 1;
      ySet.add(y);
      if (year !== "all" && y !== year) continue;
      if (months.length > 0 && !months.includes(m)) continue;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const rate = getRate(key);
      const grossUsd = contractGrossUsd(c, getRate, key);
      add(revenueByMonth, key, { uzs: grossUsd * rate, usd: grossUsd });
      // Doc xarajat = shartnoma summasi − komissiya (sheet'dagi formulaga mos).
      // Shunda Yalpi foyda = Jami daromad − Doc xarajat = komissiya,
      // ya'ni boshqaruv panelidagi "Sof daromad" bilan aynan bir xil chiqadi.
      const commissionUsd = Number(c.commission) || 0;
      const docUsd = Math.max(0, grossUsd - commissionUsd);
      if (docUsd > 0) add(docCostsByMonth, key, { uzs: docUsd * rate, usd: docUsd });
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

    // Salaries — always UZS, counted as expenses each month they're recorded
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
      salariesTotalUzs += uzs;
    }

    return {
      revenueByMonth, expenseByMonth, docCostsByMonth, expenseByCat, salariesTotalUzs,
      allYears: Array.from(ySet).sort(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, expenses, payments, salaries, basis, year, months, getRate, lang]);

  void expenseUzs; void paymentUzs; void salariesTotalUzs;

  const pick = (p: { uzs: number; usd: number } | undefined) =>
    p ? (currency === "UZS" ? p.uzs : p.usd) : 0;

  const allMonths = useMemo(() => {
    const s = new Set<string>([...revenueByMonth.keys(), ...expenseByMonth.keys()]);
    return Array.from(s).sort();
  }, [revenueByMonth, expenseByMonth]);

  const chartData = useMemo(() => {
    return allMonths.map((k) => {
      const [y, mm] = k.split("-");
      const rev = pick(revenueByMonth.get(k));
      const exp = pick(expenseByMonth.get(k));
      return {
        name: `${MONTHS[Number(mm) - 1].slice(0, 3)} ${y.slice(2)}`,
        revenue: Math.round(rev),
        expense: Math.round(exp),
        profit: Math.round(rev - exp),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMonths, revenueByMonth, expenseByMonth, currency]);

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
