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
  const canAccessSalaries = !!user && !permsLoading && can("salaries_section");

  // Fetch salaries
  const { data: rowsAll = [], isLoading } = useQuery({
    queryKey: ["salaries"],
    queryFn: async (): Promise<SalaryRow[]> => {
      const { data, error } = await supabase
        .from("salaries")
        .select("id, employee_name, month, year, fixed_amount, kpi_amount, penalty_amount, note, created_by, created_at, advance_amount")
        .order("year", { ascending: true })
        .order("month", { ascending: true })
        .order("employee_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SalaryRow[];
    },
    enabled: canAccessSalaries,
  });

  // Fetch payments (all) so we can show paid / remaining per salary
  const { data: payments = [] } = useQuery({
    queryKey: ["salary_payments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("salary_payments")
        .select("id, salary_id, amount, kind, paid_at, note");
      if (error) throw error;
      return data ?? [];
    },
    enabled: canAccessSalaries,
  });
  const paidBySalary = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments as any[]) {
      m.set(p.salary_id, (m.get(p.salary_id) ?? 0) + Number(p.amount || 0));
    }
    return m;
  }, [payments]);

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
    enabled: canAccessSalaries && creatorIds.length > 0,
  });
  const creatorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.id, p.display_name ?? "—");
    return m;
  }, [profiles]);

  // Realtime
  useEffect(() => {
    if (!canAccessSalaries) return;
    const ch = supabase
      .channel("salaries-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "salaries" }, () => {
        qc.invalidateQueries({ queryKey: ["salaries"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_payments" }, () => {
        qc.invalidateQueries({ queryKey: ["salary_payments"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canAccessSalaries, qc]);

  const [payFor, setPayFor] = useState<{ id: string; name: string; gross: number; paid: number } | null>(null);

  const enriched = useMemo(
    () => rowsAll.map((r) => {
      const gross = Number(r.fixed_amount) + Number(r.kpi_amount) - Number(r.penalty_amount);
      const advance = Number((r as any).advance_amount ?? 0);
      return {
        ...r,
        gross,               // hisobot uchun (avanssiz)
        advance,
        total: gross - advance, // berilishi kerak (avans allaqachon to'langan)
      };
    }),
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
      acc.advance += e.advance;
      acc.gross += e.gross;
      acc.total += e.total;
      return acc;
    },
    { fixed: 0, kpi: 0, penalty: 0, advance: 0, gross: 0, total: 0 },
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SumCard label={t("sal.stat.fixed")} value={fmt(totals.fixed)} />
              <SumCard label={t("sal.stat.bonus")} value={`+${fmt(totals.kpi)}`} accent="primary" />
              <SumCard label={t("sal.stat.penalty")} value={`−${fmt(totals.penalty)}`} accent="destructive" />
              <SumCard label="Hisoblangan oylik" value={fmt(totals.gross)} bold />
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
                      <TableHead className="text-right">Hisoblangan oylik</TableHead>
                      <TableHead className="text-right">Avans</TableHead>
                      <TableHead className="text-right">{t("sal.col.salary")}</TableHead>
                      <TableHead className="text-right">To'landi</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead>{t("sal.col.note")}</TableHead>
                      <TableHead>{t("sal.col.creator")}</TableHead>
                      {canCreate && <TableHead className="w-[140px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-10">{t("common.loading")}</TableCell></TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-10">{t("common.notFound")}</TableCell></TableRow>
                    ) : (
                      rows.map((e) => {
                        const paid = paidBySalary.get(e.id) ?? 0;
                        const remaining = Math.max(0, e.gross - paid);
                        const status =
                          paid <= 0 ? { label: "To'lanmagan", cls: "bg-muted text-muted-foreground" }
                          : remaining <= 0.5 ? { label: "Yopilgan", cls: "bg-primary/15 text-primary border-primary/30" }
                          : { label: "Qisman", cls: "bg-accent/15 text-accent border-accent/30" };
                        return (
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
                            <TableCell className="text-right font-semibold">{fmt(e.gross)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{e.advance > 0 ? `−${fmt(e.advance)}` : "—"}</TableCell>
                            <TableCell className="text-right font-bold text-primary">{fmt(e.total)}</TableCell>
                            <TableCell className="text-right">{fmt(paid)}</TableCell>
                            <TableCell>
                              <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs border", status.cls)}>{status.label}</span>
                              {remaining > 0.5 && paid > 0 && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">Qoldiq: {fmt(remaining)}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{e.note ?? ""}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {e.created_by ? (creatorMap.get(e.created_by) ?? "—") : "—"}
                            </TableCell>
                            {canCreate && (
                              <TableCell>
                                <div className="flex gap-1 justify-end">
                                  <Button size="sm" variant="outline" className="h-8"
                                    onClick={() => setPayFor({ id: e.id, name: e.employee_name, gross: e.gross, paid })}>
                                    <Plus className="h-3.5 w-3.5 mr-1" /> To'lov
                                  </Button>
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
                        );
                      })
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

      <PaymentDialog
        target={payFor}
        onClose={() => setPayFor(null)}
        payments={(payments as any[]).filter((p) => p.salary_id === payFor?.id)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["salary_payments"] })}
      />
    </div>
  );
}

function PaymentDialog({
  target, onClose, payments, onChanged,
}: {
  target: { id: string; name: string; gross: number; paid: number } | null;
  onClose: () => void;
  payments: any[];
  onChanged: () => void;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " UZS";
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      const remaining = Math.max(0, target.gross - target.paid);
      setAmount(remaining > 0 ? String(remaining) : "");
      setPaidAt(new Date().toISOString().slice(0, 10));
      setNote("");
    }
  }, [target]);

  if (!target) return null;
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining = Math.max(0, target.gross - totalPaid);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    const { error } = await (supabase as any).from("salary_payments").insert({
      salary_id: target.id, amount: amt, kind: "manual", paid_at: paidAt, note: note || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("To'lov qo'shildi");
    setAmount(""); setNote("");
    onChanged();
  };

  const removePayment = async (id: string) => {
    const { error } = await (supabase as any).from("salary_payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>To'lovlar — {target.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Card className="p-2"><div className="text-xs text-muted-foreground">Umumiy</div><div className="font-semibold">{fmt(target.gross)}</div></Card>
          <Card className="p-2"><div className="text-xs text-muted-foreground">To'landi</div><div className="font-semibold text-primary">{fmt(totalPaid)}</div></Card>
          <Card className="p-2"><div className="text-xs text-muted-foreground">Qoldiq</div><div className="font-semibold text-destructive">{fmt(remaining)}</div></Card>
        </div>
        <div className="space-y-2 max-h-48 overflow-auto">
          {payments.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">To'lovlar yo'q</div>
          ) : payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border rounded px-2 py-1">
              <div>
                <div className="font-medium">{fmt(Number(p.amount))} <span className="text-xs text-muted-foreground">({p.kind === "advance" ? "avans" : "to'lov"})</span></div>
                <div className="text-xs text-muted-foreground">{p.paid_at}{p.note ? ` — ${p.note}` : ""}</div>
              </div>
              {p.kind !== "advance" && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removePayment(p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs">Summa</label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label className="text-xs">Sana</label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
        </div>
        <div><label className="text-xs">Izoh</label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Yopish</Button>
          <Button onClick={submit} disabled={saving || !amount}>To'lov qo'shish</Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const [autoFixed, setAutoFixed] = useState<number>(0);
  const [autoBonus, setAutoBonus] = useState<number>(0);
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

  // Call-centre tiers (mirror src/routes/kpi.tsx)
  const CC_BASE = [
    { min: 1, max: 4, base: 1_000_000 },
    { min: 5, max: 9, base: 1_500_000 },
    { min: 10, max: 14, base: 2_000_000 },
    { min: 15, max: 19, base: 2_500_000 },
    { min: 20, max: 24, base: 3_000_000 },
    { min: 25, max: 29, base: 3_500_000 },
    { min: 30, max: Infinity, base: 4_000_000 },
  ];
  const CC_KPI = [
    { min: 10, max: 14, kpi: 5 },
    { min: 15, max: 19, kpi: 10 },
    { min: 20, max: 24, kpi: 15 },
    { min: 25, max: 29, kpi: 20 },
    { min: 30, max: Infinity, kpi: 25 },
  ];

  // Auto-fetch advances, fines, and call-centre / sales bonuses for this employee/month
  useEffect(() => {
    if (!open || !employeeName.trim()) {
      setAutoAdvance(0); setAutoPenalty(0); setAutoFixed(0); setAutoBonus(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const name = employeeName.trim();
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("full_name", name)
        .maybeSingle();
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).getDate();
      const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
      const end = `${endDateStr}T23:59:59`;

      const [advRes, fineRes, ccRes, salesApprovedRes] = await Promise.all([
        emp?.id
          ? supabase
              .from("advance_requests")
              .select("amount_uzs, status, created_at, paid_at")
              .eq("employee_id", emp.id)
              .in("status", ["approved", "paid"])
          : Promise.resolve({ data: [] as any[] }),
        emp?.id
          ? supabase
              .from("fines")
              .select("amount_uzs, date")
              .eq("employee_id", emp.id)
              .gte("date", start)
              .lte("date", endDateStr)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("contracts")
          .select("id, visa_result")
          .eq("call_centre", name)
          .eq("year", String(year))
          .eq("month", String(month)),
        (supabase as any)
          .from("sales_kpi_approvals")
          .select("bonus_uzs, status, manager_name, approved_year, approved_month")
          .eq("manager_name", name)
          .eq("approved_year", year)
          .eq("approved_month", month)
          .eq("status", "approved"),
      ]);
      if (cancelled) return;

      const advSum = (advRes.data ?? []).reduce((acc: number, r: any) => {
        const ref = r.paid_at || r.created_at;
        if (!ref) return acc;
        if (ref >= start && ref <= end) return acc + Number(r.amount_uzs || 0);
        return acc;
      }, 0);
      const fineSum = (fineRes.data ?? []).reduce(
        (acc: number, r: any) => acc + Number(r.amount_uzs || 0), 0,
      );

      // Call-centre computation
      const ccCount = (ccRes.data ?? []).filter(
        (c: any) => c.visa_result !== "Bekor qilindi" && c.visa_result !== "To'xtatildi",
      ).length;
      let ccFixed = 0, ccBonus = 0;
      if (ccCount > 0) {
        ccFixed = (CC_BASE.find((t) => ccCount >= t.min && ccCount <= t.max) ?? CC_BASE[0]).base;
        const pct = (CC_KPI.find((t) => ccCount >= t.min && ccCount <= t.max)?.kpi) ?? 0;
        ccBonus = Math.round((ccFixed * pct) / 100);
      }

      // Sales approved bonus (adds to bonus)
      const salesBonus = (salesApprovedRes.data ?? []).reduce(
        (acc: number, r: any) => acc + Number(r.bonus_uzs || 0), 0,
      );

      const totalBonus = ccBonus + salesBonus;
      setAutoAdvance(advSum);
      setAutoPenalty(fineSum);
      setAutoFixed(ccFixed);
      setAutoBonus(totalBonus);

      if (!editing) {
        setAdvance(String(advSum));
        setPenalty(String(fineSum));
        if (ccFixed > 0) setFixed(String(ccFixed));
        if (totalBonus > 0) setKpi(String(totalBonus));
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">{t("sal.form.fixed")}</label>
              {autoFixed > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setFixed(String(autoFixed))}
                  title="Call-centre KPI dan avtomatik hisoblangan asosiy oylik"
                >
                  Avtomatik: {nf(autoFixed)}
                </button>
              )}
            </div>
            <Input type="number" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">{t("sal.form.bonus")}</label>
              {autoBonus > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setKpi(String(autoBonus))}
                  title="Call-centre KPI + tasdiqlangan Sales bonuslari"
                >
                  Avtomatik: {nf(autoBonus)}
                </button>
              )}
            </div>
            <Input type="number" inputMode="decimal" value={kpi} onChange={(e) => setKpi(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">{t("sal.form.penalty")}</label>
              {autoPenalty > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setPenalty(String(autoPenalty))}
                  title="Avtomatik aniqlangan jarima summasini qo'llash"
                >
                  Avtomatik: {nf(autoPenalty)}
                </button>
              )}
            </div>
            <Input type="number" inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
            <div className="text-[11px] text-muted-foreground mt-1">
              {autoPenalty > 0
                ? `Bu oyda jarimalar yig'indisi: ${nf(autoPenalty)} so'm`
                : "Bu oyda jarima yo'q"}
            </div>
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
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Hisoblangan oylik (hisobot uchun)</span>
              <span className="font-semibold">
                {nf((parseFloat(fixed) || 0) + (parseFloat(kpi) || 0) - (parseFloat(penalty) || 0))} {t("sal.uzs")}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">− Avans (to'langan)</span>
              <span>−{nf(parseFloat(advance) || 0)} {t("sal.uzs")}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border">
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
  gross: number;
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
    grid.get(r.employee_name)!.set(k, (grid.get(r.employee_name)!.get(k) ?? 0) + r.gross);
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
