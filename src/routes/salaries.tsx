import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Wallet, LogOut, Shield, Search } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import { getWages, type WageRow } from "@/lib/wages.functions";
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

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Sheet covers June → April crossing calendar year.
// June–December = 2025, January–May = 2026.
function inferYear(month: string): number {
  const idx = MONTH_ORDER.indexOf(month);
  return idx >= 5 ? 2025 : 2026;
}

function SalariesPage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [employee, setEmployee] = useState<string>("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const fetchWages = useServerFn(getWages);
  const { data: wages = [], isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["wages"],
    queryFn: () => fetchWages(),
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 60_000, // auto-refresh every minute
  });

  const enriched = useMemo(
    () => wages.map((w) => ({ ...w, year: inferYear(w.month) })),
    [wages],
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
    return MONTH_ORDER.filter((m) => set.has(m));
  }, [enriched, year]);
  const employees = useMemo(
    () => Array.from(new Set(enriched.map((w) => w.name))).sort(),
    [enriched],
  );

  const rows = enriched
    .filter((w) => year === "all" || String(w.year) === year)
    .filter((w) => month === "all" || w.month === month)
    .filter((w) => employee === "all" || w.name === employee)
    .filter((w) => w.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month);
    });

  const totals = rows.reduce(
    (acc, e) => {
      acc.fixed += e.fixed; acc.kpi += e.kpi;
      acc.penalty += e.penalty; acc.total += e.total;
      return acc;
    },
    { fixed: 0, kpi: 0, penalty: 0, total: 0 },
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center"
      >
        <img
          src={logoUrl}
          alt=""
          className="w-[min(70vw,720px)] opacity-[0.05] select-none"
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
                  Oylik = O'zgarmas + KPI − Jarima
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dataUpdatedAt > 0 && (
                <span className="hidden sm:inline text-xs text-muted-foreground">
                  Yangilangan: {new Date(dataUpdatedAt).toLocaleTimeString("uz-UZ")}
                </span>
              )}
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center disabled:opacity-50"
                title="Yangilash"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </button>
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
                <Select value={year} onValueChange={(v) => { setYear(v); setMonth("all"); }}>
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
                <label className="text-xs text-muted-foreground mb-1 block">Oy</label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Barcha oylar</SelectItem>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ishchi</label>
                <Select value={employee} onValueChange={setEmployee}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Barcha ishchilar</SelectItem>
                    {employees.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SumCard label="Jami o'zgarmas" value={fmt(totals.fixed)} />
            <SumCard label="Jami KPI" value={`+${fmt(totals.kpi)}`} accent="primary" />
            <SumCard label="Jami jarima" value={`−${fmt(totals.penalty)}`} accent="destructive" />
            <SumCard label="Jami to'lanadigan" value={fmt(totals.total)} accent="primary" bold />
          </div>

          {/* Unified table — all months × all employees */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Oylik to'lovlar</div>
              <div className="text-xs text-muted-foreground">{rows.length} yozuv</div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Yil</TableHead>
                  <TableHead>Oy</TableHead>
                  <TableHead>Ishchi</TableHead>
                  <TableHead className="text-right">O'zgarmas</TableHead>
                  <TableHead className="text-right">KPI</TableHead>
                  <TableHead className="text-right">Jarima</TableHead>
                  <TableHead className="text-right">Oylik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Yuklanmoqda...</TableCell></TableRow>
                ) : error ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-destructive py-10">Xato: {(error as Error).message}</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Ma'lumot topilmadi.</TableCell></TableRow>
                ) : (
                  rows.map((e, i) => (
                    <TableRow key={`${e.year}-${e.month}-${e.name}-${i}`}>
                      <TableCell className="text-muted-foreground">{e.year}</TableCell>
                      <TableCell>{e.month}</TableCell>
                      <TableCell className="font-medium">
                        <button
                          className="hover:underline"
                          onClick={() => setEmployee(e.name)}
                        >
                          {e.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">{fmt(e.fixed)}</TableCell>
                      <TableCell className="text-right text-primary">+{fmt(e.kpi)}</TableCell>
                      <TableCell className="text-right text-destructive">−{fmt(e.penalty)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(e.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Pivot table — employees × months, total salary per cell */}
          <PivotTable rows={rows} fmt={fmt} />
        </main>
      </div>
    </div>
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

type PivotRow = WageRow & { year: number };

function PivotTable({ rows, fmt }: { rows: PivotRow[]; fmt: (n: number) => string }) {
  // Unique sorted month columns (year + month)
  const cols = Array.from(
    new Map(
      rows.map((r) => [`${r.year}-${r.month}`, { year: r.year, month: r.month }]),
    ).values(),
  ).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month),
  );

  const names = Array.from(new Set(rows.map((r) => r.name))).sort();

  // name -> "year-month" -> total
  const grid = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const k = `${r.year}-${r.month}`;
    if (!grid.has(r.name)) grid.set(r.name, new Map());
    grid.get(r.name)!.set(k, (grid.get(r.name)!.get(k) ?? 0) + r.total);
  }

  const colTotals = cols.map((c) =>
    names.reduce((s, n) => s + (grid.get(n)?.get(`${c.year}-${c.month}`) ?? 0), 0),
  );
  const grandTotal = colTotals.reduce((a, b) => a + b, 0);

  const short = (m: string) => m.slice(0, 3);

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
                  (s, c) => s + (grid.get(name)?.get(`${c.year}-${c.month}`) ?? 0),
                  0,
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
          </TableBody>
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
        </Table>
      </div>
    </Card>
  );
}

// Keep WageRow used by import linter
export type _W = WageRow;
