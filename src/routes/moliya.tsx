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
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line,
} from "recharts";
import { LineChart as LineChartIcon, LogOut, Shield, ChevronDown, TrendingUp, TrendingDown, DollarSign, Receipt } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { supabase } from "@/integrations/supabase/client";
import { getContracts, type Contract } from "@/lib/contracts.functions";
import { useUsdRates, DEFAULT_USD_RATE } from "@/lib/usd-rates";
import logoUrl from "@/assets/logo.png";
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

// Convert a contract to USD (uses priceUsd if available; falls back to UZS via the rate of the contract's month)
function contractToUsd(c: Contract, getRate: (ym: string) => number): number {
  if (c.priceUsd > 0) return c.priceUsd;
  if (c.priceUzs > 0) {
    const d = parseContractDate(c.contractDate);
    const ym = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      : "";
    const rate = ym ? getRate(ym) : DEFAULT_USD_RATE;
    return c.priceUzs / rate;
  }
  return 0;
}


const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const MONTHS_UZ = [
  "Yanvar","Fevral","Mart","Aprel","May","Iyun",
  "Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr",
];

const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";
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

function FinancePage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = useNavigate();

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);
  useEffect(() => {
    if (!loading && !permsLoading && user && !can("finance_section")) navigate({ to: "/" });
  }, [loading, permsLoading, user, can, navigate]);

  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [year, setYear] = useState<string>("all");
  const [months, setMonths] = useState<number[]>([]);

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

  // Build period-keyed series in UZS
  // Revenue: contracts → USD then to UZS
  // Expenses accrual = expense_date; cash = each payment paid_at
  const { revenueByMonth, expenseByMonth, expenseByCat, topExpenses, allYears } = useMemo(() => {
    const revenueByMonth = new Map<string, number>();
    const expenseByMonth = new Map<string, number>();
    const expenseByCat = new Map<string, number>();
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
      const uzs = toUsd(c) * USD_RATE;
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + uzs);
    }

    const expById = new Map<string, Expense>();
    for (const e of expenses) expById.set(e.id, e);

    if (basis === "accrual") {
      for (const e of expenses) {
        const y = e.expense_date.slice(0, 4);
        const mm = e.expense_date.slice(5, 7);
        const m = Number(mm);
        ySet.add(y);
        if (year !== "all" && y !== year) continue;
        if (months.length > 0 && !months.includes(m)) continue;
        const key = `${y}-${mm}`;
        const amt = Number(e.total_amount);
        expenseByMonth.set(key, (expenseByMonth.get(key) ?? 0) + amt);
        expenseByCat.set(e.category, (expenseByCat.get(e.category) ?? 0) + amt);
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
        const amt = Number(p.amount);
        expenseByMonth.set(key, (expenseByMonth.get(key) ?? 0) + amt);
        const exp = expById.get(p.expense_id);
        if (exp) expenseByCat.set(exp.category, (expenseByCat.get(exp.category) ?? 0) + amt);
      }
    }

    const topExpenses = Array.from(expenseByCat.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return {
      revenueByMonth, expenseByMonth, expenseByCat, topExpenses,
      allYears: Array.from(ySet).sort(),
    };
  }, [contracts, expenses, payments, basis, year, months]);

  const allMonths = useMemo(() => {
    const s = new Set<string>([...revenueByMonth.keys(), ...expenseByMonth.keys()]);
    return Array.from(s).sort();
  }, [revenueByMonth, expenseByMonth]);

  const chartData = useMemo(() => {
    return allMonths.map((k) => {
      const [y, mm] = k.split("-");
      const rev = revenueByMonth.get(k) ?? 0;
      const exp = expenseByMonth.get(k) ?? 0;
      return {
        name: `${MONTHS_UZ[Number(mm) - 1].slice(0, 3)} ${y.slice(2)}`,
        revenue: Math.round(rev),
        expense: Math.round(exp),
        profit: Math.round(rev - exp),
      };
    });
  }, [allMonths, revenueByMonth, expenseByMonth]);

  const totals = useMemo(() => {
    const revenue = Array.from(revenueByMonth.values()).reduce((s, v) => s + v, 0);
    const expense = Array.from(expenseByMonth.values()).reduce((s, v) => s + v, 0);
    const profit = revenue - expense;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, expense, profit, margin };
  }, [revenueByMonth, expenseByMonth]);

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
                <h1 className="text-xl font-bold tracking-tight">Moliyaviy hisobot</h1>
                <p className="text-xs text-muted-foreground">Daromad, xarajat va sof foyda</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Link to="/admin" className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center" title="Admin">
                  <Shield className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
                className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center"
                title="Chiqish"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-6 py-6 space-y-6">
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Hisob usuli</label>
                <div className="flex gap-1">
                  {([
                    ["accrual", "Accrual (hisoblanmaganidagi)"],
                    ["cash", "Cash (to'langan kunlardagi)"],
                  ] as const).map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setBasis(k)}
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
                <label className="text-xs text-muted-foreground mb-1 block">Yil</label>
                <Select value={year} onValueChange={(v) => { setYear(v); setMonths([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Barcha yillar</SelectItem>
                    {allYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Oylar</label>
                <MonthsPicker selected={months} onChange={setMonths} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Jami daromad" value={fmt(totals.revenue)} icon={<DollarSign className="h-4 w-4" />} tone="green" />
            <KpiCard label="Jami xarajat" value={fmt(totals.expense)} icon={<Receipt className="h-4 w-4" />} tone="red" />
            <KpiCard
              label="Sof foyda"
              value={fmt(totals.profit)}
              icon={totals.profit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              tone={totals.profit >= 0 ? "green" : "red"}
            />
            <KpiCard label="Marja" value={`${totals.margin.toFixed(1)}%`} icon={<TrendingUp className="h-4 w-4" />} />
          </div>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Oylik daromad / xarajat / sof foyda</div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                  <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} tickFormatter={fmtShort} />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Daromad" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Xarajat" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Sof foyda" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Sof foyda dinamikasi</div>
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
            <div className="text-sm font-semibold mb-3">Eng katta xarajat kategoriyalari</div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategoriya</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topExpenses.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Ma'lumot yo'q</TableCell></TableRow>
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
            {basis === "accrual"
              ? "Accrual: xarajatlar yaratilgan sana bo'yicha, daromad shartnoma sanasi bo'yicha hisoblanadi."
              : "Cash: xarajatlar to'lov sanasi bo'yicha, daromad shartnoma sanasi bo'yicha hisoblanadi."}
          </div>
        </main>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, icon, tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "green" | "red";
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
    </Card>
  );
}

function MonthsPicker({
  selected, onChange,
}: { selected: number[]; onChange: (v: number[]) => void }) {
  const toggle = (m: number) =>
    onChange(selected.includes(m) ? selected.filter((s) => s !== m) : [...selected, m]);
  const label =
    selected.length === 0 ? "Barcha oylar"
    : selected.length === 1 ? MONTHS_UZ[selected[0] - 1]
    : `${selected.length} tanlangan`;
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
          {MONTHS_UZ.map((label, i) => {
            const v = i + 1;
            const checked = selected.includes(v);
            return (
              <label key={v} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/30 cursor-pointer">
                <Checkbox checked={checked} onCheckedChange={() => toggle(v)} />
                <span className="text-xs">{label}</span>
              </label>
            );
          })}
        </div>
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="w-full text-xs text-muted-foreground mt-2 py-1 rounded hover:bg-accent/30"
          >
            Tozalash
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
