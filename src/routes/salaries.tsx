import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Wallet, LogOut, Shield, Search, ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { useT, getMonthNames, getMonthNamesShort, localeOf } from "@/lib/i18n";

export const Route = createFileRoute("/salaries")({
  component: SalariesPage,
  head: () => ({
    meta: [
      { title: "Ishchilar oyliklari — GoForVisa" },
      { name: "description", content: "Ishchilar oyliklari hisob-kitobi" },
    ],
  }),
});

type SalaryRow = {
  id: string;
  employee_name: string;
  month: number;
  year: number;
  fixed_amount: number;
  kpi_amount: number;
  penalty_amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

function SalariesPage() {
  const { t, lang } = useT();
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);

  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const [openForm, setOpenForm] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);
  useEffect(() => {
    if (!loading && !permsLoading && user && !can("salaries_section")) {
      navigate({ to: "/" });
    }
  }, [loading, permsLoading, user, can, navigate]);

  const canTotals = can("salaries_totals");
  const canPivot = can("salaries_pivot");
  const canTable = can("salaries_table");
  const canCreate = isAdmin || can("salaries_create");

  // Fetch salaries
  const { data: rowsAll = [], isLoading } = useQuery({
    queryKey: ["salaries"],
    queryFn: async (): Promise<SalaryRow[]> => {
      const { data, error } = await supabase
        .from("salaries")
        .select("*")
        .order("year", { ascending: true })
        .order("month", { ascending: true })
        .order("employee_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SalaryRow[];
    },
    enabled: !!user,
  });

  // Creator profiles
  const creatorIds = useMemo(
    () => Array.from(new Set(rowsAll.map((r) => r.created_by).filter(Boolean))) as string[],
    [rowsAll],
  );
  const { data: profiles = [] } = useQuery({
    queryKey: ["salary-creators", creatorIds.sort().join(",")],
    queryFn: async () => {
      if (creatorIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", creatorIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: creatorIds.length > 0,
  });
  const creatorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.id, p.display_name ?? "—");
    return m;
  }, [profiles]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("salaries-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "salaries" }, () => {
        qc.invalidateQueries({ queryKey: ["salaries"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const enriched = useMemo(
    () => rowsAll.map((r) => ({
      ...r,
      total: Number(r.fixed_amount) + Number(r.kpi_amount) - Number(r.penalty_amount) - Number((r as any).advance_amount ?? 0),
    })),
    [rowsAll],
  );

  const years = useMemo(
    () => Array.from(new Set(enriched.map((w) => w.year))).sort(),
    [enriched],
  );
  const months = useMemo(() => {
    const set = new Set(
      enriched
        .filter((w) => year === "all" || String(w.year) === year)
        .map((w) => w.month),
    );
    return Array.from(set).sort((a, b) => a - b);
  }, [enriched, year]);
  const employees = useMemo(
    () => Array.from(new Set(enriched.map((w) => w.employee_name))).sort(),
    [enriched],
  );

  const rows = enriched
    .filter((w) => year === "all" || String(w.year) === year)
    .filter((w) => selectedMonths.length === 0 || selectedMonths.includes(w.month))
    .filter((w) => selectedEmployees.length === 0 || selectedEmployees.includes(w.employee_name))
    .filter((w) => w.employee_name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  const totals = rows.reduce(
    (acc, e) => {
      acc.fixed += Number(e.fixed_amount);
      acc.kpi += Number(e.kpi_amount);
      acc.penalty += Number(e.penalty_amount);
      acc.total += e.total;
      return acc;
    },
    { fixed: 0, kpi: 0, penalty: 0, total: 0 },
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat(localeOf(lang)).format(Math.round(n)) + " " + t("sal.uzs");

  const onDelete = async (id: string) => {
    if (!confirm(t("sal.confirm.delete"))) return;
    const { error } = await supabase.from("salaries").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(t("sal.toast.deleted"));
  };

  const monthNames = getMonthNames(lang);

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
                <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold tracking-tight">{t("sal.title")}</h1>
                <p className="text-[11px] md:text-xs text-muted-foreground">{t("sal.subtitle")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCreate && (
                <Button
                  size="sm"
                  onClick={() => { setEditing(null); setOpenForm(true); }}
                >
                  <Plus className="h-4 w-4 mr-1" /> {t("sal.add")}
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
          {/* Filters */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("common.year")}</label>
                <Select value={year} onValueChange={(v) => { setYear(v); setSelectedMonths([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.allYears")}</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("common.months")}</label>
                <MonthsMultiSelect
                  available={months}
                  selected={selectedMonths}
                  onChange={setSelectedMonths}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("sal.filter.employees")}</label>
                <MultiSelect
                  options={employees}
                  selected={selectedEmployees}
                  onChange={setSelectedEmployees}
                  placeholder={t("sal.filter.allEmployees")}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("common.search")}</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("sal.filter.search.placeholder")}
                    className="pl-8"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Card>

          {canTotals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SumCard label={t("sal.stat.fixed")} value={fmt(totals.fixed)} />
              <SumCard label={t("sal.stat.bonus")} value={`+${fmt(totals.kpi)}`} accent="primary" />
              <SumCard label={t("sal.stat.penalty")} value={`−${fmt(totals.penalty)}`} accent="destructive" />
              <SumCard label={t("sal.stat.payable")} value={fmt(totals.total)} accent="primary" bold />
            </div>
          )}

          {canPivot && <PivotTable rows={rows} fmt={fmt} />}

          {canTable && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">{t("sal.list.title")}</div>
                <div className="text-xs text-muted-foreground">{rows.length} {t("common.records")}</div>
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("sal.col.year")}</TableHead>
                      <TableHead>{t("sal.col.month")}</TableHead>
                      <TableHead>{t("sal.col.employee")}</TableHead>
                      <TableHead className="text-right">{t("sal.col.fixed")}</TableHead>
                      <TableHead className="text-right">{t("sal.col.bonus")}</TableHead>
                      <TableHead className="text-right">{t("sal.col.penalty")}</TableHead>
                      <TableHead className="text-right">{t("sal.col.salary")}</TableHead>
                      <TableHead>{t("sal.col.note")}</TableHead>
                      <TableHead>{t("sal.col.creator")}</TableHead>
                      {canCreate && <TableHead className="w-[100px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">{t("common.loading")}</TableCell></TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">{t("common.notFound")}</TableCell></TableRow>
                    ) : (
                      rows.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-muted-foreground">{e.year}</TableCell>
                          <TableCell>{monthNames[e.month - 1]}</TableCell>
                          <TableCell className="font-medium">
                            <button
                              className="hover:underline"
                              onClick={() => setSelectedEmployees([e.employee_name])}
                            >
                              {e.employee_name}
                            </button>
                          </TableCell>
                          <TableCell className="text-right">{fmt(Number(e.fixed_amount))}</TableCell>
                          <TableCell className="text-right text-primary">+{fmt(Number(e.kpi_amount))}</TableCell>
                          <TableCell className="text-right text-destructive">−{fmt(Number(e.penalty_amount))}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(e.total)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{e.note ?? ""}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {e.created_by ? (creatorMap.get(e.created_by) ?? "—") : "—"}
                          </TableCell>
                          {canCreate && (
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-8 w-8"
                                  onClick={() => { setEditing(e); setOpenForm(true); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                                  onClick={() => onDelete(e.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </main>
      </div>

      <SalaryFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        editing={editing}
        userId={user?.id ?? null}
        knownEmployees={employees}
      />
    </div>
  );
}

function SalaryFormDialog({
  open, onOpenChange, editing, userId, knownEmployees,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SalaryRow | null;
  userId: string | null;
  knownEmployees: string[];
}) {
  const { t, lang } = useT();
  const now = new Date();
  const [employeeName, setEmployeeName] = useState("");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [fixed, setFixed] = useState<string>("0");
  const [kpi, setKpi] = useState<string>("0");
  const [penalty, setPenalty] = useState<string>("0");
  const [advance, setAdvance] = useState<string>("0");
  const [autoAdvance, setAutoAdvance] = useState<number>(0);
  const [autoPenalty, setAutoPenalty] = useState<number>(0);
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setEmployeeName(editing.employee_name);
        setYear(editing.year);
        setMonth(editing.month);
        setFixed(String(editing.fixed_amount));
        setKpi(String(editing.kpi_amount));
        setPenalty(String(editing.penalty_amount));
        setAdvance(String((editing as any).advance_amount ?? 0));
        setNote(editing.note ?? "");
      } else {
        setEmployeeName("");
        setYear(now.getFullYear());
        setMonth(now.getMonth() + 1);
        setFixed("0"); setKpi("0"); setPenalty("0"); setAdvance("0"); setNote("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // Auto-fetch approved/paid advances + fines for this employee/month
  useEffect(() => {
    if (!open || !employeeName.trim()) { setAutoAdvance(0); setAutoPenalty(0); return; }
    let cancelled = false;
    (async () => {
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("full_name", employeeName.trim())
        .maybeSingle();
      if (!emp?.id) { if (!cancelled) { setAutoAdvance(0); setAutoPenalty(0); } return; }
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).getDate();
      const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
      const end = `${endDateStr}T23:59:59`;
      const [advRes, fineRes] = await Promise.all([
        supabase
          .from("advance_requests")
          .select("amount_uzs, status, created_at, paid_at")
          .eq("employee_id", emp.id)
          .in("status", ["approved", "paid"]),
        supabase
          .from("fines")
          .select("amount_uzs, date")
          .eq("employee_id", emp.id)
          .gte("date", start)
          .lte("date", endDateStr),
      ]);
      if (cancelled) return;
      const advSum = (advRes.data ?? []).reduce((acc: number, r: any) => {
        const ref = r.paid_at || r.created_at;
        if (!ref) return acc;
        if (ref >= start && ref <= end) return acc + Number(r.amount_uzs || 0);
        return acc;
      }, 0);
      const fineSum = (fineRes.data ?? []).reduce(
        (acc: number, r: any) => acc + Number(r.amount_uzs || 0),
        0,
      );
      setAutoAdvance(advSum);
      setAutoPenalty(fineSum);
      if (!editing) {
        setAdvance(String(advSum));
        setPenalty(String(fineSum));
      }
    })();
    return () => { cancelled = true; };
  }, [open, employeeName, year, month, editing]);

  const total =
    (parseFloat(fixed) || 0) + (parseFloat(kpi) || 0) - (parseFloat(penalty) || 0) - (parseFloat(advance) || 0);

  const onSubmit = async () => {
    if (!employeeName.trim()) { toast.error(t("sal.toast.nameRequired")); return; }
    setSaving(true);
    const payload: any = {
      employee_name: employeeName.trim(),
      year,
      month,
      fixed_amount: parseFloat(fixed) || 0,
      kpi_amount: parseFloat(kpi) || 0,
      penalty_amount: parseFloat(penalty) || 0,
      advance_amount: parseFloat(advance) || 0,
      note: note.trim() || null,
    };
    const res = editing
      ? await supabase.from("salaries").update(payload).eq("id", editing.id)
      : await supabase.from("salaries").insert({ ...payload, created_by: userId });
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(editing ? t("sal.toast.updated") : t("sal.toast.added"));
    onOpenChange(false);
  };

  const monthNames = getMonthNames(lang);
  const nf = (n: number) => new Intl.NumberFormat(localeOf(lang)).format(Math.round(n));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t("sal.form.editTitle") : t("sal.form.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("sal.form.employee")}</label>
            <Input
              list="employee-names"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder={t("sal.form.namePh")}
            />
            <datalist id="employee-names">
              {knownEmployees.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("common.year")}</label>
              <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || now.getFullYear())} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("common.month")}</label>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthNames.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("sal.form.fixed")}</label>
            <Input type="number" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("sal.form.bonus")}</label>
            <Input type="number" inputMode="decimal" value={kpi} onChange={(e) => setKpi(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("sal.form.penalty")}</label>
            <Input type="number" inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Avans (ushlanmasi)</label>
              {autoAdvance > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setAdvance(String(autoAdvance))}
                  title="Avtomatik aniqlangan avans summasini qo'llash"
                >
                  Avtomatik: {nf(autoAdvance)}
                </button>
              )}
            </div>
            <Input type="number" inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} />
            <div className="text-[11px] text-muted-foreground mt-1">
              {autoAdvance > 0
                ? `Bu oyda tasdiqlangan avans: ${nf(autoAdvance)} so'm`
                : "Bu oyda tasdiqlangan avans yo'q"}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("common.note")}</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="rounded-md bg-secondary px-3 py-2 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Hisob: oklad + bonus − jarima − avans</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Berilishi kerak</span>
              <span className="text-base font-bold text-primary">
                {nf(total)} {t("sal.uzs")}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MonthsMultiSelect({
  available, selected, onChange,
}: {
  available: number[];
  selected: number[];
  onChange: (v: number[]) => void;
}) {
  const { t, lang } = useT();
  const monthNames = getMonthNames(lang);
  const toggle = (v: number) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  const label =
    selected.length === 0
      ? t("sal.ms.allMonths")
      : selected.length === 1
      ? monthNames[selected[0] - 1]
      : t("sal.ms.monthsSelected", { n: selected.length });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 h-9 text-sm hover:bg-accent/30"
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>{t("common.clear")}</button>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([...available])}>{t("sal.ms.all")}</button>
        </div>
        <div className="max-h-64 overflow-auto space-y-1">
          {available.map((m) => (
            <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(m)} onCheckedChange={() => toggle(m)} />
              <span>{monthNames[m - 1]}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MultiSelect({
  options, selected, onChange, placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const { t } = useT();
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? selected[0]
      : `${selected.length} ${t("common.selected")}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 h-9 text-sm hover:bg-accent/30"
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>{t("common.clear")}</button>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([...options])}>{t("sal.ms.all")}</button>
        </div>
        <div className="max-h-64 overflow-auto space-y-1">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(o)} onCheckedChange={() => toggle(o)} />
              <span className="truncate">{o}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-3 text-center">{t("common.empty")}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SumCard({
  label, value, accent, bold,
}: {
  label: string;
  value: string;
  accent?: "primary" | "destructive";
  bold?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1",
          bold ? "text-lg font-bold" : "text-lg font-semibold",
          accent === "primary" && "text-primary",
          accent === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
    </Card>
  );
}

type PivotRow = {
  employee_name: string;
  month: number;
  year: number;
  total: number;
};

function PivotTable({ rows, fmt }: { rows: PivotRow[]; fmt: (n: number) => string }) {
  const { t, lang } = useT();
  const monthNamesShort = getMonthNamesShort(lang);

  const cols = Array.from(
    new Map(rows.map((r) => [`${r.year}-${r.month}`, { year: r.year, month: r.month }])).values(),
  ).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  const firstSeen = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  for (const r of rows) {
    const key = r.year * 12 + r.month;
    if (!firstSeen.has(r.employee_name) || key < firstSeen.get(r.employee_name)!) firstSeen.set(r.employee_name, key);
    if (!lastSeen.has(r.employee_name) || key > lastSeen.get(r.employee_name)!) lastSeen.set(r.employee_name, key);
  }
  const names = Array.from(new Set(rows.map((r) => r.employee_name))).sort((a, b) => {
    const fa = firstSeen.get(a) ?? 0, fb = firstSeen.get(b) ?? 0;
    if (fa !== fb) return fa - fb;
    const la = lastSeen.get(a) ?? 0, lb = lastSeen.get(b) ?? 0;
    if (la !== lb) return la - lb;
    return a.localeCompare(b);
  });

  const grid = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const k = `${r.year}-${r.month}`;
    if (!grid.has(r.employee_name)) grid.set(r.employee_name, new Map());
    grid.get(r.employee_name)!.set(k, (grid.get(r.employee_name)!.get(k) ?? 0) + r.total);
  }

  const colTotals = cols.map((c) =>
    names.reduce((s, n) => s + (grid.get(n)?.get(`${c.year}-${c.month}`) ?? 0), 0),
  );
  const grandTotal = colTotals.reduce((a, b) => a + b, 0);
  const short = (m: number) => monthNamesShort[m - 1];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{t("sal.pivot.title")}</div>
        <div className="text-xs text-muted-foreground">{t("sal.pivot.subtitle", { e: names.length, m: cols.length })}</div>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">{t("sal.col.employee")}</TableHead>
              {cols.map((c) => (
                <TableHead key={`${c.year}-${c.month}`} className="text-right whitespace-nowrap">
                  <div>{short(c.month)}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">{c.year}</div>
                </TableHead>
              ))}
              <TableHead className="text-right whitespace-nowrap">{t("common.total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {names.length === 0 ? (
              <TableRow>
                <TableCell colSpan={cols.length + 2} className="text-center text-muted-foreground py-10">
                  {t("common.notFound")}
                </TableCell>
              </TableRow>
            ) : (
              names.map((name) => {
                const rowTotal = cols.reduce(
                  (s, c) => s + (grid.get(name)?.get(`${c.year}-${c.month}`) ?? 0), 0,
                );
                return (
                  <TableRow key={name}>
                    <TableCell className="sticky left-0 bg-card z-10 font-medium">{name}</TableCell>
                    {cols.map((c) => {
                      const v = grid.get(name)?.get(`${c.year}-${c.month}`) ?? 0;
                      return (
                        <TableCell
                          key={`${name}-${c.year}-${c.month}`}
                          className={cn(
                            "text-right whitespace-nowrap tabular-nums",
                            v === 0 && "text-muted-foreground/40",
                          )}
                        >
                          {v === 0 ? "—" : fmt(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                      {fmt(rowTotal)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            {names.length > 0 && (
              <TableRow className="border-t-2 bg-muted/30">
                <TableCell className="sticky left-0 bg-muted/30 z-10 font-semibold">{t("common.total")}</TableCell>
                {colTotals.map((tv, i) => (
                  <TableCell key={i} className="text-right font-semibold whitespace-nowrap tabular-nums">
                    {tv === 0 ? "—" : fmt(tv)}
                  </TableCell>
                ))}
                <TableCell className="text-right font-bold whitespace-nowrap tabular-nums text-primary">
                  {fmt(grandTotal)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
