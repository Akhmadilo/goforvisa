import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, LogOut, Shield, Search, ArrowLeft, User as UserIcon } from "lucide-react";
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
const MONTH_SHORT: Record<string, string> = {
  January: "Yan", February: "Fev", March: "Mar", April: "Apr",
  May: "May", June: "Iyn", July: "Iyl", August: "Avg",
  September: "Sen", October: "Okt", November: "Noy", December: "Dek",
};

function SalariesPage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const fetchWages = useServerFn(getWages);
  const { data: wages = [], isLoading, error } = useQuery({
    queryKey: ["wages"],
    queryFn: () => fetchWages(),
    enabled: !!user,
  });

  const months = useMemo(() => {
    const set = new Set(wages.map((w) => w.month));
    return MONTH_ORDER.filter((m) => set.has(m));
  }, [wages]);

  useEffect(() => {
    if (month === null && months.length > 0) {
      setMonth(months[months.length - 1]);
    }
  }, [months, month]);

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
                <h1 className="text-xl font-bold tracking-tight">
                  Ishchilar oyliklari
                </h1>
                <p className="text-xs text-muted-foreground">
                  Oylik = O'zgarmas + KPI − Jarima
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
          {/* Month tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {months.map((m) => (
              <button
                key={m}
                onClick={() => setMonth(m)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium border whitespace-nowrap transition",
                  month === m
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border hover:bg-secondary",
                )}
              >
                {MONTH_SHORT[m] ?? m}
              </button>
            ))}
          </div>

          {selectedEmployee ? (
            <EmployeeDetail
              name={selectedEmployee}
              wages={wages}
              onBack={() => setSelectedEmployee(null)}
              fmt={fmt}
            />
          ) : (
            <MonthView
              wages={wages}
              month={month}
              isLoading={isLoading}
              error={error as Error | null}
              query={query}
              setQuery={setQuery}
              onSelectEmployee={setSelectedEmployee}
              fmt={fmt}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function MonthView({
  wages, month, isLoading, error, query, setQuery, onSelectEmployee, fmt,
}: {
  wages: WageRow[];
  month: string | null;
  isLoading: boolean;
  error: Error | null;
  query: string;
  setQuery: (v: string) => void;
  onSelectEmployee: (name: string) => void;
  fmt: (n: number) => string;
}) {
  const rows = wages
    .filter((w) => (month ? w.month === month : true))
    .filter((w) => w.name.toLowerCase().includes(query.toLowerCase()));

  const totals = rows.reduce(
    (acc, e) => {
      acc.fixed += e.fixed; acc.kpi += e.kpi;
      acc.penalty += e.penalty; acc.total += e.total;
      return acc;
    },
    { fixed: 0, kpi: 0, penalty: 0, total: 0 },
  );

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SumCard label="Jami o'zgarmas" value={fmt(totals.fixed)} />
        <SumCard label="Jami KPI" value={`+${fmt(totals.kpi)}`} accent="primary" />
        <SumCard label="Jami jarima" value={`−${fmt(totals.penalty)}`} accent="destructive" />
        <SumCard label="Jami to'lanadigan" value={fmt(totals.total)} accent="primary" bold />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="relative w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ishchini izlash..."
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="text-xs text-muted-foreground">{rows.length} ishchi</div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ishchi</TableHead>
              <TableHead className="text-right">O'zgarmas</TableHead>
              <TableHead className="text-right">KPI</TableHead>
              <TableHead className="text-right">Jarima</TableHead>
              <TableHead className="text-right">Oylik</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Yuklanmoqda...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={5} className="text-center text-destructive py-10">Xato: {error.message}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Ma'lumot topilmadi.</TableCell></TableRow>
            ) : (
              rows.map((e, i) => (
                <TableRow
                  key={`${e.month}-${e.name}-${i}`}
                  className="cursor-pointer"
                  onClick={() => onSelectEmployee(e.name)}
                >
                  <TableCell className="font-medium flex items-center gap-2">
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    {e.name}
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
    </>
  );
}

function EmployeeDetail({
  name, wages, onBack, fmt,
}: {
  name: string;
  wages: WageRow[];
  onBack: () => void;
  fmt: (n: number) => string;
}) {
  const rows = wages
    .filter((w) => w.name === name)
    .sort(
      (a, b) =>
        MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month),
    );

  const totals = rows.reduce(
    (acc, e) => {
      acc.fixed += e.fixed; acc.kpi += e.kpi;
      acc.penalty += e.penalty; acc.total += e.total;
      return acc;
    },
    { fixed: 0, kpi: 0, penalty: 0, total: 0 },
  );

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="h-9 px-3 rounded-md border border-border bg-card hover:bg-secondary flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Orqaga
        </button>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="text-lg font-semibold leading-tight">{name}</div>
            <div className="text-xs text-muted-foreground">{rows.length} oylik yozuvi</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SumCard label="Jami o'zgarmas" value={fmt(totals.fixed)} />
        <SumCard label="Jami KPI" value={`+${fmt(totals.kpi)}`} accent="primary" />
        <SumCard label="Jami jarima" value={`−${fmt(totals.penalty)}`} accent="destructive" />
        <SumCard label="Jami olgan" value={fmt(totals.total)} accent="primary" bold />
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oy</TableHead>
              <TableHead className="text-right">O'zgarmas</TableHead>
              <TableHead className="text-right">KPI (bonus)</TableHead>
              <TableHead className="text-right">Jarima (shtraf)</TableHead>
              <TableHead className="text-right">Oylik</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e, i) => (
              <TableRow key={`${e.month}-${i}`}>
                <TableCell className="font-medium">{e.month}</TableCell>
                <TableCell className="text-right">{fmt(e.fixed)}</TableCell>
                <TableCell className="text-right text-primary">+{fmt(e.kpi)}</TableCell>
                <TableCell className="text-right text-destructive">−{fmt(e.penalty)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(e.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
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
