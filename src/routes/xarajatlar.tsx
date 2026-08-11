import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, User } from "lucide-react";
import {
  Receipt, LogOut, Shield, Search, Plus, Pencil, Trash2, Coins, TrendingUp, TrendingDown,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { supabase } from "@/integrations/supabase/client";
import { useUsdRates } from "@/lib/usd-rates";
import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { useT, getMonthNames, getMonthNamesShort, localeOf } from "@/lib/i18n";


export const Route = createFileRoute("/xarajatlar")({
  component: ExpensesPage,
  head: () => ({
    meta: [
      { title: "Xarajatlar — GoForVisa" },
      { name: "description", content: "Xarajatlar va to'lovlar boshqaruvi" },
    ],
  }),
});

type Expense = {
  id: string;
  title: string;
  category: string;
  total_amount: number;
  currency: string;
  vendor: string | null;
  notes: string | null;
  status: "unpaid" | "partial" | "paid";
  expense_date: string;
  created_at: string;
  created_by: string | null;
};

type Payment = {
  id: string;
  expense_id: string;
  amount: number;
  payment_method: string | null;
  paid_at: string;
  note: string | null;
  created_at: string;
};

// Palette for color-coding category badges; assigned by hashing category name
const CATEGORY_PALETTE = [
  "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  "bg-lime-500/15 text-lime-600 dark:text-lime-400 border-lime-500/30",
];
function categoryColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}

const PAYMENT_METHOD_VALUES = ["cash", "bank_transfer", "card"] as const;

const fmt = (n: number, currency = "UZS", locale = "uz-UZ") =>
  new Intl.NumberFormat(locale).format(Math.round(n)) + " " + (currency === "USD" ? "$" : "so'm");

function ExpensesPage() {
  const { t, lang } = useT();
  const fmtL = (n: number, c?: string) => fmt(n, c ?? "UZS", localeOf(lang));
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && !permsLoading && user && !can("expenses_section")) {
      navigate({ to: "/" });
    }
  }, [loading, permsLoading, user, can, navigate]);

  const canCreate = can("expenses_create");
  const canEdit = can("expenses_edit");
  const canDelete = can("expenses_delete");
  const canPay = can("expenses_pay");
  const canAnyAction = canCreate || canEdit || canDelete || canPay;
  const canAccessExpenses = !!user && !permsLoading && can("expenses_section");

  // Filters
  const [status, setStatus] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [category, setCategory] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]); // 1..12 as strings
  const [query, setQuery] = useState("");

  // Data
  const cacheOpts = {
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  } as const;

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, title, category, total_amount, currency, vendor, notes, status, expense_date, created_at, created_by")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
    enabled: canAccessExpenses,
    ...cacheOpts,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["expense_payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_payments")
        .select("id, expense_id, amount, payment_method, paid_at, note, created_at")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
    enabled: canAccessExpenses,
    ...cacheOpts,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["expense_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("name")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => r.name as string);
    },
    enabled: canAccessExpenses,
    ...cacheOpts,
  });

  // Profiles for creator names
  const { data: profileMap = new Map<string, string>() } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) m.set((r as any).id, (r as any).display_name ?? "—");
      return m;
    },
    enabled: canAccessExpenses,
    ...cacheOpts,
  });

  // Salaries — included as synthetic "Oyliklar" expenses for stats/dashboard/pivot
  const { data: salaryExpenses = [] } = useQuery({
    queryKey: ["salaries-as-expenses"],
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase
        .from("salaries")
        .select("id, employee_name, year, month, fixed_amount, kpi_amount, penalty_amount, note, created_by, created_at");
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        id: `salary-${s.id}`,
        title: `Oylik: ${s.employee_name}`,
        category: "Oyliklar",
        total_amount:
          Number(s.fixed_amount) + Number(s.kpi_amount) - Number(s.penalty_amount),
        currency: "UZS",
        vendor: null,
        notes: s.note,
        status: "paid" as const,
        expense_date: `${s.year}-${String(s.month).padStart(2, "0")}-01`,
        created_at: s.created_at,
        created_by: s.created_by,
      }));
    },
    enabled: canAccessExpenses,
    ...cacheOpts,
  });


  const { getRate } = useUsdRates();
  const toUzs = (e: Expense) => {
    const amt = Number(e.total_amount);
    if (e.currency === "USD") return amt * getRate(e.expense_date.slice(0, 7));
    return amt;
  };

  // Realtime subscriptions
  useEffect(() => {
    if (!canAccessExpenses) return;
    const ch = supabase
      .channel("expenses-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => {
        qc.invalidateQueries({ queryKey: ["expenses"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_payments" }, () => {
        qc.invalidateQueries({ queryKey: ["expense_payments"] });
        qc.invalidateQueries({ queryKey: ["expenses"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "salaries" }, () => {
        qc.invalidateQueries({ queryKey: ["salaries-as-expenses"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [canAccessExpenses, qc]);


  // Aggregated paid totals per expense
  const paidByExpense = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) {
      m.set(p.expense_id, (m.get(p.expense_id) ?? 0) + Number(p.amount));
    }
    return m;
  }, [payments]);

  // Years present in data (expenses + salaries)
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const e of expenses) s.add(e.expense_date.slice(0, 4));
    for (const e of salaryExpenses) s.add(e.expense_date.slice(0, 4));
    return Array.from(s).sort();
  }, [expenses, salaryExpenses]);

  const matchesPeriod = (e: Expense) => {
    const y = e.expense_date.slice(0, 4);
    const m = String(Number(e.expense_date.slice(5, 7)));
    if (selectedYear !== "all" && y !== selectedYear) return false;
    if (selectedMonths.length > 0 && !selectedMonths.includes(m)) return false;
    return true;
  };

  // Period filter — table-only (expenses, no salaries)
  const periodFiltered = useMemo(
    () => expenses.filter(matchesPeriod),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, selectedYear, selectedMonths],
  );

  // Period filter — dashboards/pivot/stats (includes salaries)
  const periodFilteredAll = useMemo(
    () => [...expenses, ...salaryExpenses].filter(matchesPeriod),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, salaryExpenses, selectedYear, selectedMonths],
  );

  // Stats — in UZS (USD converted via per-month rate); includes salaries
  const stats = useMemo(() => {
    const s = { total: 0, unpaid: 0, partial: 0, paid: 0 };
    for (const e of periodFilteredAll) {
      const amt = toUzs(e);
      s.total += amt;
      if (e.status === "unpaid") s.unpaid += amt;
      else if (e.status === "partial") s.partial += amt;
      else if (e.status === "paid") s.paid += amt;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodFilteredAll, getRate]);

  // Final rows for table: period + status + category + search (expenses only)
  const deferredQuery = useDeferredValue(query);
  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return periodFiltered.filter((e) => {
      if (status !== "all" && e.status !== status) return false;
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.vendor ?? "").toLowerCase().includes(q)
      );
    });
  }, [periodFiltered, status, category, deferredQuery]);

  const PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [status, category, deferredQuery, selectedYear, selectedMonths]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);




  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [payExpense, setPayExpense] = useState<Expense | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm(t("exp.confirm.deleteExpense"))) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(t("exp.toast.deleted"));
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%)",
          }}
        />
        <img
          src={logoUrl}
          alt=""
          className="relative w-[min(80vw,820px)] opacity-[0.12] select-none drop-shadow-[0_10px_60px_color-mix(in_oklab,var(--primary)_40%,transparent)]"
          style={{ filter: "saturate(1.1) contrast(1.05)" }}
        />
      </div>

      <div className="relative z-10 md:pl-56">
        <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-[1500px] px-4 sm:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 pl-10 md:pl-0">
              <div
                className="h-9 w-9 md:h-10 md:w-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Receipt className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold tracking-tight">{t("exp.title")}</h1>
                <p className="text-[11px] md:text-xs text-muted-foreground">
                  {t("exp.subtitle")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCreate && (
                <Button
                  onClick={() => setAddOpen(true)}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-2 md:px-3"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("exp.add")}</span>
                </Button>
              )}
              {isAdmin && (
                <Link
                  to="/admin"
                  className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center"
                  title="Admin"
                >
                  <Shield className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth" });
                }}
                className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center"
                title={t("common.logout")}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
          {/* Top filters — affect dashboards, pivot and table */}
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("common.year")}</label>
                <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); setSelectedMonths([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.allYears")}</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("common.months")}</label>
                <MonthsMultiSelect
                  selected={selectedMonths}
                  onChange={setSelectedMonths}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("exp.filter.category")}</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 md:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">{t("exp.filter.search")}</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("exp.search.placeholder")}
                    className="pl-8"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {([
                ["all", t("exp.status.all")],
                ["unpaid", t("exp.status.unpaid")],
                ["partial", t("exp.status.partial")],
                ["paid", t("exp.status.paid")],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setStatus(k)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors",
                    status === k
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-secondary",
                  )}
                >
                  {l}
                </button>
              ))}
              {(selectedYear !== "all" || selectedMonths.length > 0 || category !== "all" || status !== "all" || query) && (
                <button
                  onClick={() => {
                    setSelectedYear("all"); setSelectedMonths([]);
                    setCategory("all"); setStatus("all"); setQuery("");
                  }}
                  className="px-3 py-1.5 text-xs rounded-md border border-border bg-card hover:bg-secondary ml-auto"
                >
                  {t("common.clear")}
                </button>
              )}
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t("exp.stat.total")} value={fmtL(stats.total)} />
            <StatCard label={t("exp.stat.unpaid")} value={fmtL(stats.unpaid)} tone="red" />
            <StatCard label={t("exp.stat.partial")} value={fmtL(stats.partial)} tone="orange" />
            <StatCard label={t("exp.stat.paid")} value={fmtL(stats.paid)} tone="green" />
          </div>

          {/* Dashboard: monthly trend + top categories (UZS-normalized, includes salaries) */}
          <ExpensesDashboard expenses={periodFilteredAll.map(e => ({ ...e, total_amount: toUzs(e), currency: "UZS" }))} />

          {/* Pivot: categories × months (UZS-normalized, includes salaries) */}
          <CategoryPivotTable expenses={periodFilteredAll.map(e => ({ ...e, total_amount: toUzs(e), currency: "UZS" }))} />


          {/* Table */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">{t("exp.list.title")}</div>
              <div className="text-xs text-muted-foreground">{rows.length} {t("common.records")}</div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("exp.col.date")}</TableHead>
                    <TableHead>{t("exp.col.title")}</TableHead>
                    <TableHead>{t("exp.col.category")}</TableHead>
                    <TableHead className="text-right">{t("exp.col.total")}</TableHead>
                    <TableHead className="text-right">{t("exp.col.paid")}</TableHead>
                    <TableHead className="text-right">{t("exp.col.remaining")}</TableHead>
                    <TableHead>{t("exp.col.status")}</TableHead>
                    <TableHead>{t("exp.col.creator")}</TableHead>
                    {canAnyAction && <TableHead className="text-right">{t("exp.col.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canAnyAction ? 9 : 8} className="text-center text-muted-foreground py-10">
                        {t("exp.list.empty")}
                      </TableCell>
                    </TableRow>
                  ) : visibleRows.map((e) => {
                    const paid = paidByExpense.get(e.id) ?? 0;
                    const remaining = Number(e.total_amount) - paid;
                    const creator = e.created_by ? (profileMap.get(e.created_by) ?? "—") : "—";
                    return (
                      <TableRow
                        key={e.id}
                        className="cursor-pointer"
                        onClick={() => setDetailExpense(e)}
                      >
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {e.expense_date}
                        </TableCell>
                        <TableCell className="font-medium">{e.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border", categoryColor(e.category))}>
                            {e.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {fmtL(Number(e.total_amount), e.currency)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                          {fmtL(paid, e.currency)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right whitespace-nowrap",
                            remaining > 0 && "text-destructive font-semibold",
                          )}
                        >
                          {fmtL(remaining, e.currency)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={e.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" /> {creator}
                          </span>
                        </TableCell>
                        {canAnyAction && (
                          <TableCell className="text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {canPay && e.status !== "paid" && (
                                <Button
                                  size="sm"
                                  className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => setPayExpense(e)}
                                >
                                  <Coins className="h-3 w-3" /> {t("exp.action.pay")}
                                </Button>
                              )}
                              {canEdit && (
                                <button
                                  className="h-7 w-7 rounded-md border border-border hover:bg-secondary flex items-center justify-center"
                                  title={t("exp.action.edit")}
                                  onClick={() => setEditExpense(e)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="h-7 w-7 rounded-md border border-border hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
                                  title={t("exp.action.delete")}
                                  onClick={() => handleDelete(e.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {visibleRows.length < rows.length && (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  Yana ko'rsatish ({rows.length - visibleRows.length})
                </Button>
              </div>
            )}

          </Card>
        </main>

      </div>

      <ExpenseFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        expense={null}
        categories={categories}
      />
      <ExpenseFormDialog
        open={!!editExpense}
        onOpenChange={(o) => !o && setEditExpense(null)}
        expense={editExpense}
        categories={categories}
      />
      <PaymentDialog
        open={!!payExpense}
        onOpenChange={(o) => !o && setPayExpense(null)}
        expense={payExpense}
        paidSoFar={payExpense ? (paidByExpense.get(payExpense.id) ?? 0) : 0}
      />
      <ExpenseDetailDrawer
        expense={detailExpense}
        onOpenChange={(o) => !o && setDetailExpense(null)}
        payments={detailExpense ? payments.filter((p) => p.expense_id === detailExpense.id) : []}
        paidSoFar={detailExpense ? (paidByExpense.get(detailExpense.id) ?? 0) : 0}
        creatorName={detailExpense?.created_by ? (profileMap.get(detailExpense.created_by) ?? "—") : "—"}
        canPay={canPay}
        onAddPayment={() => {
          if (detailExpense) {
            setPayExpense(detailExpense);
            setDetailExpense(null);
          }
        }}
      />
    </div>
  );
}

function StatCard({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "orange" | "green";
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-lg font-bold",
          tone === "red" && "text-destructive",
          tone === "orange" && "text-amber-600 dark:text-amber-400",
          tone === "green" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: Expense["status"] }) {
  const { t } = useT();
  const map = {
    unpaid: { label: t("exp.status.unpaid"), cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", dot: "🔴" },
    partial: { label: t("exp.status.partial"), cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", dot: "🟠" },
    paid: { label: t("exp.status.paid"), cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", dot: "🟢" },
  };
  const s = map[status];
  return (
    <Badge variant="outline" className={cn("border gap-1", s.cls)}>
      <span>{s.dot}</span> {s.label}
    </Badge>
  );
}

function ExpenseFormDialog({
  open, onOpenChange, expense, categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense: Expense | null;
  categories: string[];
}) {
  const { t } = useT();
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [date, setDate] = useState(today);
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(expense?.title ?? "");
      setCategory(expense?.category ?? "Ofis");
      setTotalAmount(expense ? String(expense.total_amount) : "");
      setCurrency((expense?.currency as "UZS" | "USD") ?? "UZS");
      setDate(expense?.expense_date ?? today);
      setVendor(expense?.vendor ?? "");
      setNotes(expense?.notes ?? "");
    }
  }, [open, expense]);

  const handleSave = async () => {
    if (!title.trim() || !category || !totalAmount || !date) {
      toast.error(t("exp.toast.fillRequired"));
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      category,
      total_amount: Number(totalAmount),
      currency,
      vendor: vendor.trim() || null,
      notes: notes.trim() || null,
      expense_date: date,
    };
    const { error } = expense
      ? await supabase.from("expenses").update(payload).eq("id", expense.id)
      : await supabase.from("expenses").insert({ ...payload, status: "unpaid" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(expense ? t("exp.toast.updated") : t("exp.toast.added"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? t("exp.form.editTitle") : t("exp.form.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("exp.form.title")} *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("exp.form.category")} *</label>
              <div className="flex gap-1">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder={t("exp.form.choose")} /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => { setNewCatName(""); setNewCatOpen(true); }}
                  className="h-9 w-9 shrink-0 rounded-md border border-input hover:bg-secondary flex items-center justify-center"
                  title={t("exp.form.newCategory")}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("exp.form.date")} *</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("exp.form.amount")} *</label>
              <Input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("exp.form.currency")}</label>
              <div className="flex gap-1">
                {(["UZS", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={cn(
                      "flex-1 h-9 rounded-md border text-sm transition-colors",
                      currency === c
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border hover:bg-secondary",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("exp.form.vendor")}</label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("exp.form.notes")}</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("exp.form.newCategory")}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t("exp.form.categoryName")}
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCatOpen(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={savingCat || !newCatName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={async () => {
                const name = newCatName.trim();
                if (!name) return;
                setSavingCat(true);
                const { error } = await supabase.from("expense_categories").insert({ name });
                setSavingCat(false);
                if (error) { toast.error(error.message); return; }
                toast.success(t("exp.toast.catAdded"));
                setCategory(name);
                setNewCatOpen(false);
              }}
            >
              {savingCat ? t("common.saving") : t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function PaymentDialog({
  open, onOpenChange, expense, paidSoFar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense: Expense | null;
  paidSoFar: number;
}) {
  const { t, lang } = useT();
  const fmtL = (n: number, c?: string) => fmt(n, c ?? "UZS", localeOf(lang));
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const remaining = expense ? Number(expense.total_amount) - paidSoFar : 0;

  useEffect(() => {
    if (open) {
      setAmount("");
      setMethod("cash");
      setDate(today);
      setNote("");
    }
  }, [open]);

  const methodOptions = [
    { value: "cash", label: t("exp.method.cash") },
    { value: "bank_transfer", label: t("exp.method.bank") },
    { value: "card", label: t("exp.method.card") },
  ];

  const handleSave = async () => {
    if (!expense) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error(t("exp.toast.invalidAmt"));
      return;
    }
    if (amt > remaining + 0.001) {
      toast.error(t("exp.toast.overRemaining", { v: fmtL(remaining, expense.currency) }));
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("expense_payments").insert({
      expense_id: expense.id,
      amount: amt,
      payment_method: method,
      paid_at: date,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("exp.toast.payAdded"));
    onOpenChange(false);
  };

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("exp.pay.title")}</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("exp.pay.expense")}:</span>
            <span className="font-medium">{expense.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("exp.pay.totalAmount")}:</span>
            <span>{fmtL(Number(expense.total_amount), expense.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("exp.pay.paid")}:</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              {fmtL(paidSoFar, expense.currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("exp.pay.remaining")}:</span>
            <span className="text-destructive font-bold">{fmtL(remaining, expense.currency)}</span>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("exp.pay.amount")} *</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={remaining}
            />
            <div className="text-xs text-muted-foreground mt-1">
              {t("exp.pay.remaining")}: {fmtL(remaining, expense.currency)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("exp.pay.method")} *</label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {methodOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("exp.pay.date")} *</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("common.note")}</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? t("common.saving") : t("exp.pay.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDetailDrawer({
  expense, onOpenChange, payments, paidSoFar, onAddPayment, creatorName, canPay,
}: {
  expense: Expense | null;
  onOpenChange: (o: boolean) => void;
  payments: Payment[];
  paidSoFar: number;
  onAddPayment: () => void;
  creatorName: string;
  canPay: boolean;
}) {
  const { t, lang } = useT();
  const fmtL = (n: number, c?: string) => fmt(n, c ?? "UZS", localeOf(lang));

  const methodLabel = (m: string | null) => {
    if (m === "cash") return t("exp.method.cash");
    if (m === "bank_transfer") return t("exp.method.bank");
    if (m === "card") return t("exp.method.card");
    return m ?? "—";
  };

  if (!expense) return null;
  const total = Number(expense.total_amount);
  const remaining = total - paidSoFar;
  const pct = total > 0 ? Math.min(100, Math.round((paidSoFar / total) * 100)) : 0;

  const handleDeletePayment = async (id: string) => {
    if (!confirm(t("exp.confirm.deletePayment"))) return;
    const { error } = await supabase.from("expense_payments").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(t("exp.toast.payDeleted"));
  };

  return (
    <Drawer open={!!expense} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            {expense.title}
            <StatusBadge status={expense.status} />
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label={t("exp.col.category")} value={expense.category} />
            <Info label={t("exp.col.date")} value={expense.expense_date} />
            <Info label={t("exp.form.vendor")} value={expense.vendor ?? "—"} />
            <Info label={t("exp.col.total")} value={fmtL(total, expense.currency)} />
            <Info label={t("exp.col.creator")} value={creatorName} />
          </div>
          {expense.notes && <Info label={t("common.notes")} value={expense.notes} />}
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("exp.pay.paid")}: {fmtL(paidSoFar, expense.currency)}</span>
              <span className={remaining > 0 ? "text-destructive font-semibold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>
                {t("exp.pay.remaining")}: {fmtL(remaining, expense.currency)}
              </span>
            </div>
            <Progress value={pct} />
            <div className="text-xs text-muted-foreground text-right">{pct}%</div>
          </div>
          <div className="rounded-md border border-border">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-semibold">{t("exp.detail.history")}</div>
              {canPay && expense.status !== "paid" && (
                <Button
                  size="sm"
                  onClick={onAddPayment}
                  className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="h-3 w-3" /> {t("exp.pay.again")}
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("exp.col.date")}</TableHead>
                    <TableHead className="text-right">{t("common.amount")}</TableHead>
                    <TableHead>{t("exp.detail.method")}</TableHead>
                    <TableHead>{t("common.note")}</TableHead>
                    {canPay && <TableHead className="text-right w-16">{t("common.action")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canPay ? 5 : 4} className="text-center text-muted-foreground py-6">
                        {t("exp.detail.noPayments")}
                      </TableCell>
                    </TableRow>
                  ) : payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{p.paid_at}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                        {fmtL(Number(p.amount), expense.currency)}
                      </TableCell>
                      <TableCell>{methodLabel(p.payment_method)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.note ?? "—"}</TableCell>
                      {canPay && (
                        <TableCell className="text-right">
                          <button
                            className="h-7 w-7 rounded-md border border-border hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
                            title={t("exp.detail.deletePayment")}
                            onClick={() => handleDeletePayment(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

// ============ DASHBOARDS ============

function monthsBetween(expenses: Expense[]): string[] {
  if (expenses.length === 0) return [];
  const set = new Set<string>();
  for (const e of expenses) set.add(e.expense_date.slice(0, 7));
  // also fill gaps for nicer trend
  const sorted = Array.from(set).sort();
  const [minY, minM] = sorted[0].split("-").map(Number);
  const [maxY, maxM] = sorted[sorted.length - 1].split("-").map(Number);
  const out: string[] = [];
  let y = minY, m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function labelOfMonth(ym: string, shortNames: string[]) {
  const [y, m] = ym.split("-").map(Number);
  return `${shortNames[m - 1]} ${String(y).slice(2)}`;
}

function ExpensesDashboard({ expenses }: { expenses: Expense[] }) {
  const { t, lang } = useT();
  const fmtL = (n: number, c?: string) => fmt(n, c ?? "UZS", localeOf(lang));
  const shortNames = getMonthNamesShort(lang);
  const months = useMemo(() => monthsBetween(expenses), [expenses]);

  // Monthly totals
  const monthlyData = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) {
      const k = e.expense_date.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + Number(e.total_amount));
    }
    return months.map((ym) => ({
      month: labelOfMonth(ym, shortNames),
      raw: ym,
      total: Math.round(m.get(ym) ?? 0),
    }));
  }, [expenses, months, shortNames]);

  // Top categories (all time)
  const catData = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) {
      m.set(e.category, (m.get(e.category) ?? 0) + Number(e.total_amount));
    }
    return Array.from(m.entries())
      .map(([name, total]) => ({ name, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [expenses]);

  // Month-over-month delta (last vs prev)
  const delta = useMemo(() => {
    const n = monthlyData.length;
    if (n < 2) return null;
    const last = monthlyData[n - 1].total;
    const prev = monthlyData[n - 2].total;
    if (prev === 0) return null;
    const pct = ((last - prev) / prev) * 100;
    return { last, prev, pct };
  }, [monthlyData]);

  const avgMonthly = useMemo(() => {
    if (monthlyData.length === 0) return 0;
    return monthlyData.reduce((s, d) => s + d.total, 0) / monthlyData.length;
  }, [monthlyData]);

  const barPalette = [
    "#10b981", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899",
    "#06b6d4", "#ef4444", "#84cc16", "#6366f1", "#14b8a6",
  ];

  const tooltipFmt = (v: number) => fmtL(v);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Monthly trend — area chart */}
      <Card className="p-4 lg:col-span-2">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-sm font-semibold">{t("exp.dash.monthlyTrend")}</div>
            <div className="text-xs text-muted-foreground">
              {t("exp.dash.avg")}: {fmtL(avgMonthly)}
            </div>
          </div>
          {delta && (
            <div
              className={cn(
                "text-xs flex items-center gap-1 px-2 py-1 rounded-md border",
                delta.pct >= 0
                  ? "text-destructive border-destructive/30 bg-destructive/10"
                  : "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
              )}
            >
              {delta.pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta.pct >= 0 ? "+" : ""}{delta.pct.toFixed(1)}% {t("exp.dash.momChange")}
            </div>
          )}
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.5}
                tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)}
              />
              <Tooltip
                formatter={tooltipFmt}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#gradExp)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Top categories — horizontal bar */}
      <Card className="p-4">
        <div className="text-sm font-semibold mb-1">{t("exp.dash.topCategories")}</div>
        <div className="text-xs text-muted-foreground mb-2">{t("exp.dash.byTotal")}</div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={catData} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                stroke="currentColor"
                opacity={0.5}
                tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.7}
                width={90}
              />
              <Tooltip
                formatter={tooltipFmt}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                {catData.map((_, i) => (
                  <Cell key={i} fill={barPalette[i % barPalette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function CategoryPivotTable({ expenses }: { expenses: Expense[] }) {
  const { t, lang } = useT();
  const fmtL = (n: number, c?: string) => fmt(n, c ?? "UZS", localeOf(lang));
  const shortNames = getMonthNamesShort(lang);
  const months = useMemo(() => monthsBetween(expenses), [expenses]);

  const { grid, categories, colTotals, rowTotals, grandTotal } = useMemo(() => {
    const grid = new Map<string, Map<string, number>>();
    for (const e of expenses) {
      const ym = e.expense_date.slice(0, 7);
      if (!grid.has(e.category)) grid.set(e.category, new Map());
      const row = grid.get(e.category)!;
      row.set(ym, (row.get(ym) ?? 0) + Number(e.total_amount));
    }
    const rowTotals = new Map<string, number>();
    for (const [cat, row] of grid) {
      let s = 0;
      for (const v of row.values()) s += v;
      rowTotals.set(cat, s);
    }
    const categories = Array.from(grid.keys()).sort(
      (a, b) => (rowTotals.get(b) ?? 0) - (rowTotals.get(a) ?? 0),
    );
    const colTotals = months.map((ym) =>
      categories.reduce((s, c) => s + (grid.get(c)?.get(ym) ?? 0), 0),
    );
    const grandTotal = colTotals.reduce((a, b) => a + b, 0);
    return { grid, categories, colTotals, rowTotals, grandTotal };
  }, [expenses, months]);

  if (categories.length === 0) {
    return null;
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">{t("exp.pivot.title")}</div>
          <div className="text-xs text-muted-foreground">
            {t("exp.pivot.subtitle", { c: categories.length, m: months.length })}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("exp.pivot.grand")} <span className="font-semibold text-foreground">{fmtL(grandTotal)}</span>
        </div>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card z-10 min-w-[160px]">{t("exp.col.category")}</TableHead>
              {months.map((ym) => (
                <TableHead key={ym} className="text-right whitespace-nowrap">
                  <div>{labelOfMonth(ym, shortNames).split(" ")[0]}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    {labelOfMonth(ym, shortNames).split(" ")[1]}
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-right whitespace-nowrap sticky right-0 bg-card z-10">{t("exp.col.total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => {
              const total = rowTotals.get(cat) ?? 0;
              return (
                <TableRow key={cat}>
                  <TableCell className="sticky left-0 bg-card z-10 font-medium">
                    <Badge variant="outline" className={cn("border", categoryColor(cat))}>
                      {cat}
                    </Badge>
                  </TableCell>
                  {months.map((ym) => {
                    const v = grid.get(cat)?.get(ym) ?? 0;
                    return (
                      <TableCell
                        key={`${cat}-${ym}`}
                        className={cn(
                          "text-right whitespace-nowrap tabular-nums text-xs",
                          v === 0 && "text-muted-foreground/30",
                        )}
                      >
                        {v === 0 ? "—" : fmtL(v)}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums sticky right-0 bg-card z-10">
                    {fmtL(total)}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="border-t-2 bg-muted/30">
              <TableCell className="sticky left-0 bg-muted/30 z-10 font-semibold">{t("exp.col.total")}</TableCell>
              {colTotals.map((tv, i) => (
                <TableCell key={i} className="text-right font-semibold whitespace-nowrap tabular-nums text-xs">
                  {tv === 0 ? "—" : fmtL(tv)}
                </TableCell>
              ))}
              <TableCell className="text-right font-bold whitespace-nowrap tabular-nums sticky right-0 bg-muted/30 z-10 text-primary">
                {fmtL(grandTotal)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function MonthsMultiSelect({
  selected, onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const { t, lang } = useT();
  const monthNames = getMonthNames(lang);
  const months = monthNames.map((name, i) => [String(i + 1), name] as const);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);

  const label =
    selected.length === 0
      ? t("common.allMonths")
      : selected.length === 1
      ? monthNames[Number(selected[0]) - 1] ?? selected[0]
      : `${selected.length} ${t("common.selected")}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 h-9 text-sm hover:bg-accent/30"
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange([])}
          >
            {t("common.clear")}
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange(months.map((m) => m[0]))}
          >
            {t("sal.ms.all")}
          </button>
        </div>
        <div className="max-h-64 overflow-auto space-y-1">
          {months.map(([k, l]) => (
            <label
              key={k}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(k)}
                onCheckedChange={() => toggle(k)}
              />
              <span className="truncate">{l}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
