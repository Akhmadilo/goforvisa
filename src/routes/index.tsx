import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  TrendingUp,
  Users,
  FileSignature,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
} from "lucide-react";
import { getContracts, type Contract } from "@/lib/contracts.functions";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Shartnomalar Dashboard — CFO View" },
      {
        name: "description",
        content:
          "Mijozlar, shartnomalar va viza natijalari bo'yicha real vaqt analitika.",
      },
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

const USD_RATE = 12600; // approx UZS per USD for unified totals

function toUsd(c: Contract): number {
  if (c.priceUsd > 0) return c.priceUsd;
  if (c.priceUzs > 0) return c.priceUzs / USD_RATE;
  return 0;
}

function fmtUsd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort();
}

function Dashboard() {
  const fetchContracts = useServerFn(getContracts);
  const { data, isLoading, error } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => fetchContracts(),
  });

  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [manager, setManager] = useState<string>("all");
  const [visa, setVisa] = useState<string>("all");
  const [company, setCompany] = useState<string>("all");
  const [search, setSearch] = useState("");

  const all = data ?? [];

  const opts = useMemo(
    () => ({
      years: unique(all.map((c) => c.year)),
      months: unique(all.map((c) => c.month)).sort(
        (a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b),
      ),
      managers: unique(all.map((c) => c.salesManager)),
      visas: unique(all.map((c) => c.visaResult)),
      companies: unique(all.map((c) => c.company)),
    }),
    [all],
  );

  const filtered = useMemo(() => {
    return all.filter((c) => {
      if (year !== "all" && c.year !== year) return false;
      if (month !== "all" && c.month !== month) return false;
      if (manager !== "all" && c.salesManager !== manager) return false;
      if (visa !== "all" && c.visaResult !== visa) return false;
      if (company !== "all" && c.company !== company) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.contractNo.toLowerCase().includes(q) &&
          !c.phone.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [all, year, month, manager, visa, company, search]);

  const kpis = useMemo(() => {
    const totalUsd = filtered.reduce((s, c) => s + toUsd(c), 0);
    const commission = filtered.reduce((s, c) => s + c.commission, 0);
    const margin = totalUsd - commission;
    const marginPct = totalUsd > 0 ? (margin / totalUsd) * 100 : 0;
    const clients = filtered.length;
    const avgComm = clients > 0 ? commission / clients : 0;
    const visaTaken = filtered.filter((c) => c.visaResult === "Taken").length;
    const visaRejected = filtered.filter(
      (c) => c.visaResult === "Rejected",
    ).length;
    const visaInProcess = filtered.filter(
      (c) => c.visaResult === "In process" || c.visaResult === "In Process",
    ).length;
    const successRate =
      visaTaken + visaRejected > 0
        ? (visaTaken / (visaTaken + visaRejected)) * 100
        : 0;
    return {
      totalUsd,
      commission,
      margin,
      marginPct,
      clients,
      avgComm,
      visaTaken,
      visaRejected,
      visaInProcess,
      successRate,
    };
  }, [filtered]);

  const monthlyData = useMemo(() => {
    const buckets = new Map<string, { revenue: number; commission: number; clients: number }>();
    for (const c of filtered) {
      const key = `${c.year} ${c.month}`;
      const b = buckets.get(key) ?? { revenue: 0, commission: 0, clients: 0 };
      b.revenue += toUsd(c);
      b.commission += c.commission;
      b.clients += 1;
      buckets.set(key, b);
    }
    return Array.from(buckets.entries())
      .map(([k, v]) => ({ name: k, ...v }))
      .sort((a, b) => {
        const [ya, ma] = a.name.split(" ");
        const [yb, mb] = b.name.split(" ");
        if (ya !== yb) return Number(ya) - Number(yb);
        return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
      });
  }, [filtered]);

  const visaData = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filtered) {
      const key = c.visaResult || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const managerData = useMemo(() => {
    const map = new Map<
      string,
      { clients: number; revenue: number; commission: number }
    >();
    for (const c of filtered) {
      const key = c.salesManager || "—";
      const m = map.get(key) ?? { clients: 0, revenue: 0, commission: 0 };
      m.clients += 1;
      m.revenue += toUsd(c);
      m.commission += c.commission;
      map.set(key, m);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [filtered]);

  const typeData = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filtered) {
      const key = c.type || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filtered]);

  const PIE_COLORS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-[1500px] px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ background: "var(--gradient-primary)" }}
              >
                <FileSignature className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Shartnomalar Dashboard
                </h1>
                <p className="text-xs text-muted-foreground">
                  CFO View · Mijozlar bazasi · Real-time
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Live · Google Sheets
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-6 space-y-6">
        {error && (
          <Card className="p-4 border-destructive/50 text-destructive">
            Xatolik: {(error as Error).message}
          </Card>
        )}

        {/* Filters */}
        <Card className="p-4 shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FilterSelect
              label="Yil"
              value={year}
              onChange={setYear}
              options={opts.years}
            />
            <FilterSelect
              label="Oy"
              value={month}
              onChange={setMonth}
              options={opts.months}
            />
            <FilterSelect
              label="Menejer"
              value={manager}
              onChange={setManager}
              options={opts.managers}
            />
            <FilterSelect
              label="Visa"
              value={visa}
              onChange={setVisa}
              options={opts.visas}
            />
            <FilterSelect
              label="Kompaniya"
              value={company}
              onChange={setCompany}
              options={opts.companies}
            />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Qidirish
              </label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Ism, raqam, telefon"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Kpi
            icon={<DollarSign className="h-4 w-4" />}
            label="Jami shartnoma"
            value={fmtUsd(kpis.totalUsd)}
            sub={`${kpis.clients} ta mijoz`}
            tone="primary"
          />
          <Kpi
            icon={<TrendingUp className="h-4 w-4" />}
            label="Komissiya"
            value={fmtUsd(kpis.commission)}
            sub={`O'rtacha ${fmtUsd(kpis.avgComm)}`}
          />
          <Kpi
            icon={<TrendingUp className="h-4 w-4" />}
            label="Gross Margin"
            value={fmtUsd(kpis.margin)}
            sub={`${kpis.marginPct.toFixed(1)}% margin`}
            tone="accent"
          />
          <Kpi
            icon={<Users className="h-4 w-4" />}
            label="Mijozlar"
            value={kpis.clients.toLocaleString()}
            sub={`${kpis.visaTaken} visa olingan`}
          />
          <Kpi
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Visa Success"
            value={kpis.successRate.toFixed(1) + "%"}
            sub={`${kpis.visaRejected} rejected · ${kpis.visaInProcess} jarayonda`}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Oylik daromad va komissiya</h3>
              <Badge variant="secondary">{monthlyData.length} oy</Badge>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  name="Daromad $"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="commission"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2.5}
                  name="Komissiya $"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold mb-4">Visa natijalari</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={visaData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={3}
                >
                  {visaData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold mb-4">Top menejerlar (daromad)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={managerData} layout="vertical">
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={110}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="revenue" fill="var(--color-chart-1)" name="Daromad $" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold mb-4">Shartnoma turlari</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={typeData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="value" fill="var(--color-chart-2)" name="Soni" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Table */}
        <Card className="shadow-[var(--shadow-card)] overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold">
              Shartnomalar ro'yxati{" "}
              <span className="text-muted-foreground font-normal">
                ({filtered.length})
              </span>
            </h3>
            {isLoading && (
              <span className="text-xs text-muted-foreground">
                Yuklanmoqda...
              </span>
            )}
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>№</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Mijoz</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Tur</TableHead>
                  <TableHead className="text-right">Narx</TableHead>
                  <TableHead className="text-right">Komissiya</TableHead>
                  <TableHead>Menejer</TableHead>
                  <TableHead>Visa</TableHead>
                  <TableHead>To'lov</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 300).map((c, i) => (
                  <TableRow key={`${c.contractNo}-${i}`}>
                    <TableCell className="font-mono text-xs">
                      {c.contractNo}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {c.contractDate}
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.phone}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {c.type || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.priceUsd > 0
                        ? `$${c.priceUsd.toLocaleString()}`
                        : c.priceUzs > 0
                          ? `${(c.priceUzs / 1000).toLocaleString()}k UZS`
                          : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.commission > 0 ? `$${c.commission.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{c.salesManager}</TableCell>
                    <TableCell>
                      <VisaBadge result={c.visaResult} />
                    </TableCell>
                    <TableCell className="text-xs">{c.payment}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 300 && (
            <div className="p-3 text-xs text-center text-muted-foreground border-t border-border">
              Ko'rsatilmoqda 300 / {filtered.length}. Filtrlardan foydalaning.
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Barchasi</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "accent";
}) {
  return (
    <Card className="p-5 shadow-[var(--shadow-card)] relative overflow-hidden">
      {tone && (
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{
            background:
              tone === "primary"
                ? "var(--gradient-primary)"
                : "var(--color-accent)",
          }}
        />
      )}
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function VisaBadge({ result }: { result: string }) {
  const r = result.toLowerCase();
  if (r === "taken")
    return (
      <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Taken
      </Badge>
    );
  if (r === "rejected")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20">
        <XCircle className="h-3 w-3 mr-1" /> Rejected
      </Badge>
    );
  if (r.includes("process"))
    return (
      <Badge className="bg-accent/15 text-accent border-accent/30 hover:bg-accent/20">
        <Clock className="h-3 w-3 mr-1" /> In process
      </Badge>
    );
  return <Badge variant="outline">{result || "—"}</Badge>;
}
