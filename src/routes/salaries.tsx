import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, LogOut, Shield, Search } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import { getWages } from "@/lib/wages.functions";
import logoUrl from "@/assets/logo.png";

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

function SalariesPage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState<string>("all");

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

  // Default to latest available month
  useEffect(() => {
    if (month === "all" && months.length > 0) {
      setMonth(months[months.length - 1]);
    }
  }, [months, month]);

  const rows = wages
    .filter((w) => (month === "all" ? true : w.month === month))
    .filter((w) => w.name.toLowerCase().includes(query.toLowerCase()));

  const fmt = (n: number) =>
    new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";

  const totals = rows.reduce(
    (acc, e) => {
      acc.fixed += e.fixed;
      acc.kpi += e.kpi;
      acc.penalty += e.penalty;
      acc.total += e.total;
      return acc;
    },
    { fixed: 0, kpi: 0, penalty: 0, total: 0 },
  );

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami o'zgarmas</div>
              <div className="text-lg font-semibold mt-1">{fmt(totals.fixed)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami KPI</div>
              <div className="text-lg font-semibold mt-1 text-primary">
                +{fmt(totals.kpi)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami jarima</div>
              <div className="text-lg font-semibold mt-1 text-destructive">
                −{fmt(totals.penalty)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami to'lanadigan</div>
              <div className="text-lg font-bold mt-1 text-primary">
                {fmt(totals.total)}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Oy tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Barcha oylar</SelectItem>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-[220px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ishchini izlash..."
                    className="pl-8"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {rows.length} ishchi
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
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
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      Yuklanmoqda...
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-destructive py-10">
                      Xato: {(error as Error).message}
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      Ma'lumot topilmadi.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((e, i) => (
                    <TableRow key={`${e.month}-${e.name}-${i}`}>
                      <TableCell className="text-muted-foreground">{e.month}</TableCell>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="text-right">{fmt(e.fixed)}</TableCell>
                      <TableCell className="text-right text-primary">
                        +{fmt(e.kpi)}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        −{fmt(e.penalty)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmt(e.total)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </main>
      </div>
    </div>
  );
}
