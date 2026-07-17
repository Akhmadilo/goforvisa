import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  AreaChart,
  Area,
  ComposedChart,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
  RefreshCw,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { getContracts, type Contract } from "@/lib/contracts.functions";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { useUsdRates } from "@/lib/usd-rates";
import { Link } from "@tanstack/react-router";
import { LogOut, Shield } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { AppSidebar } from "@/components/app-sidebar";
import { useT, format, localeOf } from "@/lib/i18n";

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

// Build "YYYY-MM" key from a contract using its contract date, with fallback
// to the year/month name columns. Same logic as moliya hisoboti.
function contractYM(c: Contract): string | null {
  const d = parseContractDate(c.contractDate);
  if (d && !isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const y = (c.year || "").trim();
  const mIdx = MONTH_ORDER.indexOf((c.month || "").trim());
  if (!y || mIdx < 0) return null;
  return `${y}-${String(mIdx + 1).padStart(2, "0")}`;
}

function toUsd(c: Contract, getRate: (ym: string) => number): number {
  if (c.priceUsd > 0) return c.priceUsd;
  if (c.priceUzs > 0) {
    const ym = contractYM(c);
    const rate = ym ? getRate(ym) : getRate("");
    return c.priceUzs / rate;
  }
  return 0;
}

function fmtUsd(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

// Komissiya = Google Sheets'dagi formulani o'zgartirmaymiz, sheet'dan o'qiymiz
function netProfit(c: Contract): number {
  return c.commission || 0;
}

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort();
}

const VISA_I18N_KEY: Record<string, string> = {
  "Olindi": "visa.Olindi",
  "Taken": "visa.Olindi",
  "Approved": "visa.Olindi",
  "Rad etildi": "visa.RadEtildi",
  "Rejected": "visa.RadEtildi",
  "Topshirildi": "visa.Topshirildi",
  "Submitted": "visa.Topshirildi",
  "Jarayonda": "visa.Jarayonda",
  "In process": "visa.Jarayonda",
  "In Process": "visa.Jarayonda",
  "Bekor qilindi": "visa.BekorQilindi",
  "Cancelled": "visa.BekorQilindi",
};

function visaLabel(value: string | null | undefined, t: (k: any) => string) {
  if (!value) return "—";
  const key = VISA_I18N_KEY[value];
  return key ? t(key) : value;
}

// Semantic colors for visa/status categories — green=success, red=fail, amber=in-progress, gray=cancelled
const VISA_COLOR: Record<string, string> = {
  "visa.Olindi": "#10b981",       // emerald
  "visa.RadEtildi": "#ef4444",    // red
  "visa.Jarayonda": "#f59e0b",    // amber
  "visa.Topshirildi": "#3b82f6",  // blue (submitted)
  "visa.BekorQilindi": "#94a3b8", // slate (cancelled)
};

function visaColor(value: string | null | undefined): string {
  if (!value) return "#94a3b8";
  const key = VISA_I18N_KEY[value];
  return (key && VISA_COLOR[key]) || "#6366f1";
}

function parseContractDate(s: string): Date | null {
  if (!s) return null;
  // Format: "10 June 2025"
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = Route.useNavigate();
  const { t, lang } = useT();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth" });
    }
  }, [authLoading, user, navigate]);

  const hasDashboardDataWidget = [
    "kpi",
    "monthly_revenue",
    "visa_results",
    "managers_revenue",
    "contract_types",
    "managers_clients",
    "companies_sales_pie",
    "companies_revenue",
    "sales_monthly",
    "backoffice_monthly",
    "companies_monthly",
    "debtors",
    "cumulative_revenue",
    "payment_status",
    "top_clients",
    "yoy_comparison",
  ].some(can);

  const fetchContracts = useServerFn(getContracts);
  const { data, isLoading, isFetching, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => fetchContracts(),
    staleTime: 60_000,
    enabled: !!user && !permsLoading && hasDashboardDataWidget,
  });

  // Dynamic monthly USD rate — same source as Moliyaviy hisobot, so totals match.
  const { getRate } = useUsdRates();

  const [year, setYear] = useState<string>("all");
  const [months, setMonths] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [backOffices, setBackOffices] = useState<string[]>([]);
  const [visas, setVisas] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const all = data ?? [];

  const opts = useMemo(
    () => ({
      years: unique(all.map((c) => c.year)),
      months: unique(all.map((c) => c.month)).sort(
        (a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b),
      ),
      managers: unique(all.map((c) => c.salesManager)),
      backOffices: unique(all.map((c) => c.backOfficeManager)),
      visas: unique(all.map((c) => c.visaResult)),
      companies: unique(all.map((c) => c.company)),
    }),
    [all],
  );

  type SkipKey = "manager" | "backOffice" | "company" | "visa";
  const matches = (c: Contract, skip?: SkipKey) => {
    if (year !== "all" && c.year !== year) return false;
    if (months.length > 0 && !months.includes(c.month)) return false;
    if (skip !== "manager" && managers.length > 0 && !managers.includes(c.salesManager)) return false;
    if (skip !== "backOffice" && backOffices.length > 0 && !backOffices.includes(c.backOfficeManager)) return false;
    if (skip !== "visa" && visas.length > 0 && !visas.includes(c.visaResult)) return false;
    if (skip !== "company" && companies.length > 0 && !companies.includes(c.company)) return false;
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
  };

  const deps = [all, year, months, managers, backOffices, visas, companies, search];
  const filtered = useMemo(() => all.filter((c) => matches(c)), deps);
  const filteredForManagers = useMemo(() => all.filter((c) => matches(c, "manager")), deps);
  const filteredForBackOffice = useMemo(() => all.filter((c) => matches(c, "backOffice")), deps);
  const filteredForCompanies = useMemo(() => all.filter((c) => matches(c, "company")), deps);

  const kpis = useMemo(() => {
    const isTaken = (v: string) => v === "Olindi" || v === "Taken" || v === "Approved";
    const isRejected = (v: string) => v === "Rad etildi" || v === "Rejected";
    const isInProcess = (v: string) =>
      v === "Jarayonda" || v === "In process" || v === "In Process" ||
      v === "Topshirildi" || v === "Submitted";

    const totalUsd = filtered.reduce((s, c) => s + toUsd(c, getRate), 0);
    const docsTotal = filtered.reduce((s, c) => s + (c.docsUsd || 0), 0);
    const commission = filtered.reduce((s, c) => s + (c.commission || 0), 0);
    const marginPct = totalUsd > 0 ? (commission / totalUsd) * 100 : 0;
    const clients = filtered.length;
    const avgComm = clients > 0 ? commission / clients : 0;
    const visaTaken = filtered.filter((c) => isTaken(c.visaResult)).length;
    const visaRejected = filtered.filter((c) => isRejected(c.visaResult)).length;
    const visaInProcess = filtered.filter((c) => isInProcess(c.visaResult)).length;
    // Success rate = taken / decided (taken + rejected). Exclude cancelled and in-process.
    const decided = visaTaken + visaRejected;
    const successRate = decided > 0 ? (visaTaken / decided) * 100 : 0;
    return {
      totalUsd,
      docsTotal,
      commission,
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
      b.revenue += toUsd(c, getRate);
      b.commission += netProfit(c);
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
    return Array.from(map.entries()).map(([name, value]) => ({
      name: visaLabel(name, t),
      raw: name,
      value,
      color: visaColor(name),
    }));
  }, [filtered, lang]);


  const managerData = useMemo(() => {
    const map = new Map<
      string,
      { clients: number; revenue: number; commission: number }
    >();
    for (const c of filteredForManagers) {
      const key = c.salesManager || "—";
      const m = map.get(key) ?? { clients: 0, revenue: 0, commission: 0 };
      m.clients += 1;
      m.revenue += toUsd(c, getRate);
      m.commission += netProfit(c);
      map.set(key, m);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [filteredForManagers]);

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

  const companyData = useMemo(() => {
    const map = new Map<string, { clients: number; revenue: number; profit: number }>();
    for (const c of filteredForCompanies) {
      const key = c.company || "—";
      const m = map.get(key) ?? { clients: 0, revenue: 0, profit: 0 };
      m.clients += 1;
      m.revenue += toUsd(c, getRate);
      m.profit += netProfit(c);
      map.set(key, m);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.clients - a.clients);
  }, [filteredForCompanies]);

  // Oylik time-series helper: rows = months, columns = each entity (top-N)
  function buildMonthlySeries(
    source: Contract[],
    keyOf: (c: Contract) => string,
    valueOf: (c: Contract) => number,
    topN = 8,
  ) {
    const totals = new Map<string, number>();
    for (const c of source) {
      const k = keyOf(c) || "—";
      totals.set(k, (totals.get(k) ?? 0) + valueOf(c));
    }
    const top = Array.from(totals.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([k]) => k);
    const topSet = new Set(top);

    const monthMap = new Map<string, Record<string, number | string>>();
    for (const c of source) {
      const k = keyOf(c) || "—";
      if (!topSet.has(k)) continue;
      const name = `${c.year} ${c.month}`;
      const row = monthMap.get(name) ?? { name };
      row[k] = ((row[k] as number) ?? 0) + valueOf(c);
      monthMap.set(name, row);
    }
    const rows = Array.from(monthMap.values()).sort((a, b) => {
      const [ya, ma] = (a.name as string).split(" ");
      const [yb, mb] = (b.name as string).split(" ");
      if (ya !== yb) return Number(ya) - Number(yb);
      return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
    });
    // ensure each top key exists on each row (Recharts handles missing as gap; we want 0)
    for (const row of rows) for (const k of top) if (row[k] == null) row[k] = 0;
    return { rows, keys: top };
  }

  // Cumulative revenue & net profit over time (chronological)
  const cumulativeData = useMemo(() => {
    let cumRev = 0;
    let cumNet = 0;
    return monthlyData.map((m) => {
      cumRev += m.revenue;
      cumNet += m.commission;
      return { name: m.name, revenue: cumRev, commission: cumNet };
    });
  }, [monthlyData]);

  // Payment status donut — paid vs remaining across filtered contracts
  const paymentStatusData = useMemo(() => {
    let paid = 0;
    let remaining = 0;
    for (const c of filtered) {
      paid += c.paidUsd || 0;
      remaining += c.remainingUsd || 0;
    }
    return { paid, remaining };
  }, [filtered]);

  // Top 10 clients by revenue
  const topClientsData = useMemo(() => {
    return [...filtered]
      .map((c) => ({
        name: c.name || c.contractNo || "—",
        revenue: toUsd(c, getRate),
        commission: c.commission || 0,
      }))
      .filter((c) => c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filtered]);

  // Year-over-year — grouped monthly revenue by year
  const yoyData = useMemo(() => {
    const yearsSet = new Set<string>();
    const map = new Map<string, Record<string, number | string>>();
    for (const c of filtered) {
      if (!c.year || !c.month) continue;
      yearsSet.add(c.year);
      const row = map.get(c.month) ?? { name: c.month };
      row[c.year] = ((row[c.year] as number) ?? 0) + toUsd(c, getRate);
      map.set(c.month, row);
    }
    const years = Array.from(yearsSet).sort();
    const rows = Array.from(map.values())
      .map((r) => {
        for (const y of years) if (r[y] == null) r[y] = 0;
        return r;
      })
      .sort(
        (a, b) =>
          MONTH_ORDER.indexOf(a.name as string) -
          MONTH_ORDER.indexOf(b.name as string),
      );
    return { rows, years };
  }, [filtered]);


  const salesMonthly = useMemo(
    () => buildMonthlySeries(filtered, (c) => c.salesManager, () => 1),
    [filtered],
  );
  const backOfficeMonthly = useMemo(
    () => buildMonthlySeries(filtered, (c) => c.backOfficeManager, () => 1),
    [filtered],
  );
  const companyMonthly = useMemo(
    () => buildMonthlySeries(filtered, (c) => c.company, () => 1),
    [filtered],
  );


  const debtors = useMemo(() => {
    const today = new Date();
    return filtered
      .filter((c) => (c.remainingUsd || 0) > 0.5)
      .filter((c) => (c.visaResult ?? "").trim() !== "To'xtatildi")
      .map((c) => {
        const date = parseContractDate(c.contractDate);
        const days = date ? daysBetween(today, date) : 0;
        return { ...c, daysOverdue: days, parsedDate: date };
      })
      .sort((a, b) => (b.remainingUsd || 0) - (a.remainingUsd || 0));
  }, [filtered]);

  const debtorsTotalUsd = useMemo(
    () => debtors.reduce((s, c) => s + (c.remainingUsd || 0), 0),
    [debtors],
  );

  const PIE_COLORS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];

  const [profileName, setProfileName] = useState<string>("");
  useEffect(() => {
    if (!user) { setProfileName(""); return; }
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfileName((data as any)?.display_name ?? ""));
  }, [user]);

  const displayName =
    profileName ||
    (user?.user_metadata as any)?.display_name ||
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.name ||
    "";
  const initials = displayName
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      <AppSidebar />
      {/* GoForVisa watermark */}
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
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 pl-10 md:pl-0">
            <div
              className="h-9 w-9 md:h-10 md:w-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--gradient-primary)" }}
            >
              <FileSignature className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base md:text-xl font-bold tracking-tight">
                {t("dash.title")}
              </h1>
              <p className="text-[11px] md:text-xs text-muted-foreground">
                {t("dash.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="text-right hidden sm:block">
              <div className="flex items-center gap-2 text-xs text-muted-foreground justify-end">
                <span className={`h-2 w-2 rounded-full ${isFetching ? "bg-accent animate-pulse" : "bg-primary"}`} />
                {isFetching ? t("common.updating") : t("common.live")}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {dataUpdatedAt
                  ? `${t("common.last")}: ${new Date(dataUpdatedAt).toLocaleTimeString(localeOf(lang))}`
                  : "—"}
              </div>
            </div>
            {displayName && (
              <div className="flex items-center gap-2 pl-2 border-l border-border">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                  title={user?.email ?? ""}
                >
                  {initials || "U"}
                </div>
                <div className="hidden md:block leading-tight">
                  <div className="text-sm font-medium">{displayName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {isAdmin ? "Admin" : t("common.user")}
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary transition-colors flex items-center justify-center disabled:opacity-50"
              title={t("common.refresh")}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            {isAdmin && (
              <Link
                to="/admin"
                className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary transition-colors flex items-center justify-center"
                title="Admin Panel"
              >
                <Shield className="h-4 w-4" />
              </Link>
            )}
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
              className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary transition-colors flex items-center justify-center"
              title={t("common.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {error && (
          <Card className="p-4 border-destructive/50 text-destructive">
            {t("common.error")}: {(error as Error).message}
          </Card>
        )}

        {/* Filters */}
        <Card className="p-3 md:p-4 shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 md:gap-3">
            <FilterSelect
              label={t("dash.filter.year")}
              value={year}
              onChange={setYear}
              options={opts.years}
            />
            <MultiFilter
              label={t("dash.filter.month")}
              values={months}
              onChange={setMonths}
              options={opts.months}
            />
            <MultiFilter
              label={t("dash.filter.salesManager")}
              values={managers}
              onChange={setManagers}
              options={opts.managers}
            />
            <MultiFilter
              label={t("dash.filter.backOffice")}
              values={backOffices}
              onChange={setBackOffices}
              options={opts.backOffices}
            />
            <MultiFilter
              label={t("dash.filter.visa")}
              values={visas}
              onChange={setVisas}
              options={opts.visas}
              renderOption={(v) => visaLabel(v, t)}
            />
            <MultiFilter
              label={t("dash.filter.company")}
              values={companies}
              onChange={setCompanies}
              options={opts.companies}
            />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {t("common.search")}
              </label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("dash.search.placeholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* KPIs */}
        {can("kpi") && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <Kpi
            icon={<DollarSign className="h-3 w-3 md:h-4 md:w-4" />}
            label={t("dash.kpi.totalContracts")}
            value={fmtUsd(kpis.totalUsd)}
            sub={`${kpis.clients} ${t("dash.kpi.clients")}`}
            tone="primary"
          />
          <Kpi
            icon={<TrendingUp className="h-3 w-3 md:h-4 md:w-4" />}
            label={t("dash.kpi.netRevenue")}
            value={fmtUsd(kpis.commission)}
            sub={`${kpis.marginPct.toFixed(1)}% · ${t("dash.kpi.netRevenueSub")}`}
            tone="primary"
          />
          <Kpi
            icon={<DollarSign className="h-3 w-3 md:h-4 md:w-4" />}
            label={t("dash.kpi.docCost")}
            value={fmtUsd(kpis.docsTotal)}
            sub={`${t("dash.kpi.avgNet")} ${fmtUsd(kpis.avgComm)}`}
            tone="accent"
          />
          <Kpi
            icon={<Users className="h-3 w-3 md:h-4 md:w-4" />}
            label={t("dash.kpi.clientsLabel")}
            value={kpis.clients.toLocaleString()}
            sub={`${kpis.visaTaken} ${t("dash.kpi.visaTaken")}`}
          />
          <Kpi
            icon={<CheckCircle2 className="h-3 w-3 md:h-4 md:w-4" />}
            label={t("dash.kpi.visaSuccess")}
            value={kpis.successRate.toFixed(1) + "%"}
            sub={`${kpis.visaTaken} / ${kpis.clients} · ${kpis.visaRejected} ${t("dash.kpi.rejected")} · ${kpis.visaInProcess} ${t("dash.kpi.inProcess")}`}
          />
          <Kpi
            icon={<AlertTriangle className="h-3 w-3 md:h-4 md:w-4" />}
            label={t("dash.kpi.debtors")}
            value={debtors.length.toString()}
            sub={`${t("dash.kpi.totalDebt")} ${fmtUsd(debtorsTotalUsd)}`}
            tone="danger"
          />
        </div>
        )}

        {/* Charts row */}
        {(can("monthly_revenue") || can("visa_results")) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {can("monthly_revenue") && (
          <Card className="p-4 md:p-5 lg:col-span-2 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="font-semibold text-sm md:text-base">{t("dash.chart.monthly")}</h3>
              <Badge variant="secondary">{monthlyData.length} {t("dash.chart.monthsCount")}</Badge>
            </div>
            <div className="h-[200px] md:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
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
                    name={t("dash.chart.revenueUsd")}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="commission"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2.5}
                    name={t("dash.chart.netUsd")}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          )}

          {can("visa_results") && (
          <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold text-sm md:text-base mb-3 md:mb-4">{t("dash.chart.visaResults")}</h3>
            <div className="h-[200px] md:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={visaData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {visaData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
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
            </div>
          </Card>
          )}
        </div>
        )}


        {(can("managers_revenue") || can("contract_types")) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {can("managers_revenue") && (
          <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold text-sm md:text-base mb-3 md:mb-4">{t("dash.chart.salesManagersRevenue")}</h3>
            <div className="h-[200px] md:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={managerData} layout="vertical">
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="revenue" fill="var(--color-chart-1)" name={t("dash.chart.revenueUsd")} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="commission" fill="var(--color-chart-3)" name={t("dash.chart.netUsd")} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          )}

          {can("contract_types") && (
          <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold text-sm md:text-base mb-3 md:mb-4">{t("dash.chart.contractTypes")}</h3>
            <div className="h-[200px] md:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
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
                  <Bar dataKey="value" fill="var(--color-chart-2)" name={t("dash.chart.count")} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          )}
        </div>
        )}

        {/* Managers clients + Companies */}
        {(can("managers_clients") || can("companies_sales_pie")) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {can("managers_clients") && (
          <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="font-semibold text-sm md:text-base">{t("dash.chart.managersClients")}</h3>
              <Badge variant="secondary">{managerData.length}</Badge>
            </div>
            <div className="h-[200px] md:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={managerData}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} angle={-20} textAnchor="end" height={60} interval={0} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="clients" fill="var(--color-chart-2)" name={t("dash.kpi.clientsLabel")} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          )}

          {can("companies_sales_pie") && (
          <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="font-semibold text-sm md:text-base">{t("dash.chart.companiesSales")}</h3>
              <Badge variant="secondary">{companyData.length}</Badge>
            </div>
            <div className="h-[200px] md:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={companyData}
                    dataKey="clients"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    label={(e: { name: string; clients: number }) => `${e.name} (${e.clients})`}
                    labelLine={false}
                  >
                    {companyData.map((_, i) => (
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
            </div>
          </Card>
          )}
        </div>
        )}

        {can("companies_revenue") && (
        <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
          <h3 className="font-semibold text-sm md:text-base mb-3 md:mb-4">{t("dash.chart.companiesRevenue")}</h3>
          <div className="h-[220px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={companyData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} angle={-15} textAnchor="end" height={60} interval={0} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="revenue" fill="var(--color-chart-1)" name={t("dash.chart.revenueUsd")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="var(--color-chart-3)" name={t("dash.chart.netUsd")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        )}

        {can("sales_monthly") && (
        <MonthlySeriesCard
          title={t("dash.chart.salesMonthly")}
          data={salesMonthly}
          colors={PIE_COLORS}
        />
        )}
        {can("backoffice_monthly") && (
        <MonthlySeriesCard
          title={t("dash.chart.backOfficeMonthly")}
          data={backOfficeMonthly}
          colors={PIE_COLORS}
        />
        )}
        {can("companies_monthly") && (
        <MonthlySeriesCard
          title={t("dash.chart.companiesMonthly")}
          data={companyMonthly}
          colors={PIE_COLORS}
        />
        )}

        {/* Cumulative growth (area) + Payment status (donut) */}
        {(can("cumulative_revenue") || can("payment_status")) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {can("cumulative_revenue") && (
          <Card className="p-4 md:p-5 lg:col-span-2 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="font-semibold text-sm md:text-base">{t("dash.chart.cumulative")}</h3>
              <Badge variant="secondary">{t("dash.chart.cumulativeSub")}</Badge>
            </div>
            <div className="h-[220px] md:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeData}>
                  <defs>
                    <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                    formatter={(v: number) => fmtUsd(v)}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2.5}
                    fill="url(#gradRev)"
                    name={t("dash.chart.revenueUsd")}
                  />
                  <Area
                    type="monotone"
                    dataKey="commission"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2.5}
                    fill="url(#gradNet)"
                    name={t("dash.chart.netUsd")}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          )}

          {can("payment_status") && (
          <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold text-sm md:text-base mb-3 md:mb-4">{t("dash.chart.paymentStatus")}</h3>
            <div className="h-[220px] md:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: t("dash.chart.paid"), value: Math.max(0, paymentStatusData.paid) },
                      { name: t("dash.chart.remaining"), value: Math.max(0, paymentStatusData.remaining) },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    <Cell fill="var(--color-chart-3)" />
                    <Cell fill="var(--color-chart-5)" />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                    formatter={(v: number) => fmtUsd(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2">
                <div className="text-muted-foreground">{t("dash.chart.paid")}</div>
                <div className="font-semibold">{fmtUsd(paymentStatusData.paid)}</div>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <div className="text-muted-foreground">{t("dash.chart.remaining")}</div>
                <div className="font-semibold text-destructive">{fmtUsd(paymentStatusData.remaining)}</div>
              </div>
            </div>
          </Card>
          )}
        </div>
        )}

        {can("top_clients") && topClientsData.length > 0 && (
        <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
          <h3 className="font-semibold text-sm md:text-base mb-3 md:mb-4">{t("dash.chart.topClients")}</h3>
          <div className="h-[280px] md:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topClientsData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={140}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                  formatter={(v: number) => fmtUsd(v)}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="revenue" fill="var(--color-chart-1)" name={t("dash.chart.revenueUsd")} radius={[0, 4, 4, 0]} />
                <Bar dataKey="commission" fill="var(--color-chart-3)" name={t("dash.chart.netUsd")} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        )}

        {can("yoy_comparison") && yoyData.years.length > 0 && (
        <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="font-semibold text-sm md:text-base">{t("dash.chart.yoy")}</h3>
            <Badge variant="secondary">{yoyData.years.length}</Badge>
          </div>
          <div className="h-[240px] md:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={yoyData.rows}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                  formatter={(v: number) => fmtUsd(v)}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                {yoyData.years.map((y, i) => (
                  <Bar
                    key={y}
                    dataKey={y}
                    fill={PIE_COLORS[i % PIE_COLORS.length]}
                    name={y}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        )}



        {can("debtors") && (
        <Card className="shadow-[var(--shadow-card)] overflow-hidden border-destructive/30">
          <div className="p-4 md:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-destructive/5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm md:text-base">
                  {t("dash.debtors.title")}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({debtors.length})
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("dash.debtors.subtitle")}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-muted-foreground">{t("dash.kpi.totalDebt")}</div>
              <div className="text-lg font-bold text-destructive">
                {fmtUsd(debtorsTotalUsd)}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[420px] md:max-h-[500px] overflow-y-auto">
            {debtors.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {t("dash.debtors.none")}
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>{t("dash.table.client")}</TableHead>
                    <TableHead>{t("dash.table.phone")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead className="text-right">{t("dash.table.daysOverdue")}</TableHead>
                    <TableHead className="text-right">{t("dash.table.contract")}</TableHead>
                    <TableHead className="text-right">To'langan</TableHead>
                    <TableHead className="text-right">Qoldiq</TableHead>
                    <TableHead>{t("dash.table.manager")}</TableHead>
                    <TableHead>{t("common.note")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtors.map((c, i) => (
                    <TableRow
                      key={`debt-${c.contractNo}-${i}`}
                      className="hover:bg-destructive/5"
                    >
                      <TableCell className="font-mono text-xs">
                        {c.contractNo || (i + 1)}
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.phone}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {c.contractDate}
                      </TableCell>
                      <TableCell className="text-right">
                        <DaysBadge days={c.daysOverdue} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {c.priceUsd > 0
                          ? `$${c.priceUsd.toLocaleString()}`
                          : c.priceUzs > 0
                            ? `${(c.priceUzs / 1000).toLocaleString()}k UZS`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-green-700 dark:text-green-400">
                        ${Math.round(c.paidUsd).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-destructive">
                        ${Math.round(c.remainingUsd).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.salesManager}
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground max-w-[240px] truncate"
                        title={c.note}
                      >
                        {c.note}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
        )}

        {/* Contracts table removed from CFO dashboard — full list lives in /shartnomalar */}

      </main>
      </div>
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
  const { t } = useT();
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("common.all")}</SelectItem>
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
  tone?: "primary" | "accent" | "danger";
}) {
  const toneBg =
    tone === "primary"
      ? "var(--gradient-primary)"
      : tone === "accent"
        ? "var(--color-accent)"
        : tone === "danger"
          ? "var(--color-destructive)"
          : undefined;
  return (
    <Card className="p-3 md:p-5 shadow-[var(--shadow-card)] relative overflow-hidden">
      {tone && (
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: toneBg }}
        />
      )}
      <div className="flex items-center gap-1.5 md:gap-2 text-muted-foreground text-[10px] md:text-xs uppercase tracking-wide">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 md:mt-2 text-lg md:text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-[10px] md:text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
    </Card>
  );
}

function DaysBadge({ days }: { days: number }) {
  const { t } = useT();
  if (days <= 0)
    return <span className="text-xs text-muted-foreground">—</span>;
  let cls = "bg-muted text-muted-foreground border-border";
  if (days >= 90) cls = "bg-destructive/20 text-destructive border-destructive/40";
  else if (days >= 30) cls = "bg-accent/20 text-accent border-accent/40";
  else if (days >= 7) cls = "bg-chart-3/20 text-chart-3 border-chart-3/40";
  return (
    <Badge className={`${cls} font-mono`}>
      {days} {t("dash.days")}
    </Badge>
  );
}

function VisaBadge({ result }: { result: string }) {
  const { t } = useT();
  const r = result.toLowerCase();
  if (r === "taken")
    return (
      <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
        <CheckCircle2 className="h-3 w-3 mr-1" /> {visaLabel(result, t)}
      </Badge>
    );
  if (r === "rejected")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20">
        <XCircle className="h-3 w-3 mr-1" /> {visaLabel(result, t)}
      </Badge>
    );
  if (r.includes("process"))
    return (
      <Badge className="bg-accent/15 text-accent border-accent/30 hover:bg-accent/20">
        <Clock className="h-3 w-3 mr-1" /> {visaLabel(result, t)}
      </Badge>
    );
  return <Badge variant="outline">{visaLabel(result, t)}</Badge>;
}

function MultiFilter({
  label,
  values,
  onChange,
  options,
  renderOption,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  renderOption?: (v: string) => string;
}) {
  const { t } = useT();
  const toggle = (o: string) => {
    if (values.includes(o)) onChange(values.filter((v) => v !== o));
    else onChange([...values, o]);
  };
  const display =
    values.length === 0
      ? t("common.all")
      : values.length === 1
        ? (renderOption ? renderOption(values[0]) : values[0])
        : `${values.length} ${t("common.selected")}`;
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm flex items-center justify-between gap-2 hover:bg-accent/5"
          >
            <span className="truncate">{display}</span>
            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="flex items-center justify-between px-1 pb-2 border-b border-border mb-2">
            <span className="text-xs text-muted-foreground">{values.length} {t("common.selected")}</span>
            {values.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-primary hover:underline"
              >
                {t("common.clear")}
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {options.map((o) => (
              <div
                key={o}
                role="button"
                onClick={() => toggle(o)}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/10 cursor-pointer select-none"
              >
                <Checkbox checked={values.includes(o)} tabIndex={-1} />
                <span className="text-sm truncate">{renderOption ? renderOption(o) : o}</span>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MonthlySeriesCard({
  title,
  data,
  colors,
}: {
  title: string;
  data: { rows: Array<Record<string, number | string>>; keys: string[] };
  colors: string[];
}) {
  const { t } = useT();
  const suffix = t("common.countSuffix");
  return (
    <Card className="p-4 md:p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h3 className="font-semibold text-sm md:text-base">{title}</h3>
        <Badge variant="secondary">{data.keys.length}{suffix ? ` ${suffix}` : ""}</Badge>
      </div>
      {data.rows.length === 0 ? (
        <div className="h-[220px] md:h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          {t("common.noData")}
        </div>
      ) : (
        <div className="h-[220px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.rows}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                angle={-15}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
                filterNull
                content={({ active, payload, label }) => {
                  if (!active || !payload) return null;
                  const items = payload.filter((p) => Number(p.value) > 0);
                  if (items.length === 0) return null;
                  return (
                    <div
                      style={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                      {items.map((p) => (
                        <div key={String(p.dataKey)} style={{ color: p.color }}>
                          {p.name} : {p.value}
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {data.keys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  name={k}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
