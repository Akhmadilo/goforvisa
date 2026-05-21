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

export const Route = createFileRoute("/salaries")({
  component: SalariesPage,
  head: () => ({
    meta: [
      { title: "Ishchilar oyliklari — GoForVisa" },
      { name: "description", content: "Ishchilar oyliklari hisob-kitobi" },
    ],
  }),
});

const UZ_MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

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
      total: Number(r.fixed_amount) + Number(r.kpi_amount) - Number(r.penalty_amount),
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
    new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";

  const onDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    const { error } = await supabase.from("salaries").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("O'chirildi");
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
          <div className="mx-auto max-w-[1500px] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Wallet className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Ishchilar oyliklari</h1>
                <p className="text-xs text-muted-foreground">
                  Oylik = O'zgarmas + Bonus (KPI) − Jarima
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCreate && (
                <Button
                  size="sm"
                  onClick={() => { setEditing(null); setOpenForm(true); }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Oylik qo'shish
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
                title="Chiqish"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-6 py-6 space-y-6">
          {/* Filters */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Yil</label>
                <Select value={year} onValueChange={(v) => { setYear(v); setSelectedMonths([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Barcha yillar</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Oylar</label>
                <MonthsMultiSelect
                  available={months}
                  selected={selectedMonths}
                  onChange={setSelectedMonths}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ishchilar</label>
                <MultiSelect
                  options={employees}
                  selected={selectedEmployees}
                  onChange={setSelectedEmployees}
                  placeholder="Barcha ishchilar"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Qidiruv</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ism..."
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
              <SumCard label="Jami o'zgarmas" value={fmt(totals.fixed)} />
              <SumCard label="Jami bonus (KPI)" value={`+${fmt(totals.kpi)}`} accent="primary" />
              <SumCard label="Jami jarima" value={`−${fmt(totals.penalty)}`} accent="destructive" />
              <SumCard label="Jami to'lanadigan" value={fmt(totals.total)} accent="primary" bold />
            </div>
          )}

          {canPivot && <PivotTable rows={rows} fmt={fmt} />}

          {canTable && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Oylik to'lovlar</div>
                <div className="text-xs text-muted-foreground">{rows.length} yozuv</div>
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Yil</TableHead>
                      <TableHead>Oy</TableHead>
                      <TableHead>Ishchi</TableHead>
                      <TableHead className="text-right">O'zgarmas</TableHead>
                      <TableHead className="text-right">Bonus</TableHead>
                      <TableHead className="text-right">Jarima</TableHead>
                      <TableHead className="text-right">Oylik</TableHead>
                      <TableHead>Izoh</TableHead>
                      <TableHead>Yaratuvchi</TableHead>
                      {canCreate && <TableHead className="w-[100px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">Yuklanmoqda...</TableCell></TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">Ma'lumot topilmadi.</TableCell></TableRow>
                    ) : (
                      rows.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-muted-foreground">{e.year}</TableCell>
                          <TableCell>{UZ_MONTHS[e.month - 1]}</TableCell>
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
  const now = new Date();
  const [employeeName, setEmployeeName] = useState("");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [fixed, setFixed] = useState<string>("0");
  const [kpi, setKpi] = useState<string>("0");
  const [penalty, setPenalty] = useState<string>("0");
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
        setNote(editing.note ?? "");
      } else {
        setEmployeeName("");
        setYear(now.getFullYear());
        setMonth(now.getMonth() + 1);
        setFixed("0"); setKpi("0"); setPenalty("0"); setNote("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const total =
    (parseFloat(fixed) || 0) + (parseFloat(kpi) || 0) - (parseFloat(penalty) || 0);

  const onSubmit = async () => {
    if (!employeeName.trim()) { toast.error("Ishchi ismini kiriting"); return; }
    setSaving(true);
    const payload = {
      employee_name: employeeName.trim(),
      year,
      month,
      fixed_amount: parseFloat(fixed) || 0,
      kpi_amount: parseFloat(kpi) || 0,
      penalty_amount: parseFloat(penalty) || 0,
      note: note.trim() || null,
    };
    const res = editing
      ? await supabase.from("salaries").update(payload).eq("id", editing.id)
      : await supabase.from("salaries").insert({ ...payload, created_by: userId });
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(editing ? "Yangilandi" : "Qo'shildi");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Oylikni tahrirlash" : "Yangi oylik qo'shish"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ishchi</label>
            <Input
              list="employee-names"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Ism"
            />
            <datalist id="employee-names">
              {knownEmployees.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Yil</label>
              <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || now.getFullYear())} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Oy</label>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UZ_MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">O'zgarmas oylik (so'm)</label>
            <Input type="number" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Bonus / KPI (so'm)</label>
            <Input type="number" inputMode="decimal" value={kpi} onChange={(e) => setKpi(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Jarima (so'm)</label>
            <Input type="number" inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Izoh</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="text-sm flex items-center justify-between rounded-md bg-secondary px-3 py-2">
            <span className="text-muted-foreground">Jami oylik:</span>
            <span className="font-semibold">
              {new Intl.NumberFormat("uz-UZ").format(Math.round(total))} so'm
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button onClick={onSubmit} disabled={saving}>{saving ? "Saqlanmoqda..." : "Saqlash"}</Button>
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
  const toggle = (v: number) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  const label =
    selected.length === 0
      ? "Barcha oylar"
      : selected.length === 1
      ? UZ_MONTHS[selected[0] - 1]
      : `${selected.length} oy tanlangan`;
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
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>Tozalash</button>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([...available])}>Hammasi</button>
        </div>
        <div className="max-h-64 overflow-auto space-y-1">
          {available.map((m) => (
            <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(m)} onCheckedChange={() => toggle(m)} />
              <span>{UZ_MONTHS[m - 1]}</span>
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
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? selected[0]
      : `${selected.length} tanlangan`;
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
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>Tozalash</button>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange([...options])}>Hammasi</button>
        </div>
        <div className="max-h-64 overflow-auto space-y-1">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(o)} onCheckedChange={() => toggle(o)} />
              <span className="truncate">{o}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-3 text-center">Bo'sh</div>
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
  const short = (m: number) => UZ_MONTHS[m - 1].slice(0, 3);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">Ishchilar bo'yicha oylik to'lovlar (jadval)</div>
        <div className="text-xs text-muted-foreground">{names.length} ishchi × {cols.length} oy</div>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">Ishchi</TableHead>
              {cols.map((c) => (
                <TableHead key={`${c.year}-${c.month}`} className="text-right whitespace-nowrap">
                  <div>{short(c.month)}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">{c.year}</div>
                </TableHead>
              ))}
              <TableHead className="text-right whitespace-nowrap">Jami</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {names.length === 0 ? (
              <TableRow>
                <TableCell colSpan={cols.length + 2} className="text-center text-muted-foreground py-10">
                  Ma'lumot topilmadi.
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
                <TableCell className="sticky left-0 bg-muted/30 z-10 font-semibold">Jami</TableCell>
                {colTotals.map((t, i) => (
                  <TableCell key={i} className="text-right font-semibold whitespace-nowrap tabular-nums">
                    {t === 0 ? "—" : fmt(t)}
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
