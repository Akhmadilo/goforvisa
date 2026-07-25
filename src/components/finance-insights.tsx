import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ComposedChart, Bar, Line, Cell, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Users, Target, Activity, PieChart as PieIcon } from "lucide-react";
import type { Contract } from "@/lib/contracts.functions";
import { cn } from "@/lib/utils";

type Expense = {
  id: string;
  expense_date: string;
  total_amount: number | string;
  currency: string;
  category: string;
};

type Payment = {
  expense_id: string;
  paid_at: string;
  amount: number | string;
};

type Pair = { uzs: number; usd: number };

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseContractDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function contractPeriod(c: Contract): { year: string; month: number; key: string } | null {
  const y = (c.year || "").trim();
  const mIdx = MONTH_ORDER.indexOf((c.month || "").trim());
  if (y && mIdx >= 0) {
    const month = mIdx + 1;
    return { year: y, month, key: `${y}-${String(month).padStart(2, "0")}` };
  }
  const d = parseContractDate(c.contractDate);
  if (!d) return null;
  const year = String(d.getFullYear());
  const month = d.getMonth() + 1;
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

function contractGrossUsd(c: Contract, getRate: (ym: string) => number, ym: string): number {
  const uzs = Number(c.priceUzs) || 0;
  const usd = Number(c.priceUsd) || 0;
  if (usd > 0) return usd;
  if (uzs > 0) return uzs / getRate(ym);
  return 0;
}

function isFullyPaid(c: Contract): boolean {
  const p = (c.payment || "").trim().toLowerCase();
  return p === "fully paid" || p === "paid" || p === "to'liq" || p === "toliq";
}

function isCancelled(c: Contract): boolean {
  const v = (c.visaResult || "").toLowerCase();
  return v === "cancelled" || v.includes("bekor") || v.includes("to'xtat");
}

export function FinanceInsights({
  contracts, expenses, payments,
  year, months, basis, currency, getRate,
  fmt, monthNames, t,
}: {
  contracts: Contract[];
  expenses: Expense[];
  payments: Payment[];
  year: string;
  months: number[];
  basis: "accrual" | "cash";
  currency: "UZS" | "USD";
  getRate: (ym: string) => number;
  fmt: (n: number) => string;
  monthNames: string[];
  t: (k: string) => string;
}) {
  const pick = (p: Pair | undefined) => p ? (currency === "UZS" ? p.uzs : p.usd) : 0;

  // Filter contracts per current period + basis
  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      const p = contractPeriod(c);
      if (!p) return false;
      if (year !== "all" && p.year !== year) return false;
      if (months.length > 0 && !months.includes(p.month)) return false;
      if (basis === "cash" && !isFullyPaid(c)) return false;
      return true;
    });
  }, [contracts, year, months, basis]);

  // Monthly aggregates for waterfall + collection
  const monthlyAgg = useMemo(() => {
    const rev = new Map<string, Pair>();
    const doc = new Map<string, Pair>();
    const add = (m: Map<string, Pair>, k: string, v: Pair) => {
      const cur = m.get(k) ?? { uzs: 0, usd: 0 };
      m.set(k, { uzs: cur.uzs + v.uzs, usd: cur.usd + v.usd });
    };
    for (const c of filteredContracts) {
      const p = contractPeriod(c)!;
      const rate = getRate(p.key);
      const grossUsd = contractGrossUsd(c, getRate, p.key);
      add(rev, p.key, { uzs: grossUsd * rate, usd: grossUsd });
      const commission = Number(c.commission) || 0;
      const docUsd = Math.max(0, grossUsd - commission);
      add(doc, p.key, { uzs: docUsd * rate, usd: docUsd });
    }
    return { rev, doc };
  }, [filteredContracts, getRate]);

  // ============= 1. Collection efficiency =============
  const collectionData = useMemo(() => {
    // Invoiced per month (contract period) and Collected per month (payments)
    const invoiced = new Map<string, number>();
    const collected = new Map<string, number>();

    for (const c of filteredContracts) {
      const p = contractPeriod(c)!;
      const rate = getRate(p.key);
      const grossUsd = contractGrossUsd(c, getRate, p.key);
      const val = currency === "USD" ? grossUsd : grossUsd * rate;
      invoiced.set(p.key, (invoiced.get(p.key) ?? 0) + val);
      // paid so far attributed to the contract period
      const paidUsd = Number(c.paidUsd) || 0;
      const paidVal = currency === "USD" ? paidUsd : paidUsd * rate;
      collected.set(p.key, (collected.get(p.key) ?? 0) + paidVal);
    }
    const keys = Array.from(new Set([...invoiced.keys(), ...collected.keys()])).sort();
    return keys.map((k) => {
      const [y, mm] = k.split("-");
      const inv = Math.round(invoiced.get(k) ?? 0);
      const col = Math.round(collected.get(k) ?? 0);
      const rate = inv > 0 ? (col / inv) * 100 : 0;
      return {
        name: `${monthNames[Number(mm) - 1].slice(0, 3)} ${y.slice(2)}`,
        invoiced: inv,
        collected: col,
        rate: Math.round(rate * 10) / 10,
      };
    });
  }, [filteredContracts, currency, getRate, monthNames]);

  const overallCollection = useMemo(() => {
    let inv = 0, col = 0;
    for (const r of collectionData) { inv += r.invoiced; col += r.collected; }
    return { inv, col, rate: inv > 0 ? (col / inv) * 100 : 0 };
  }, [collectionData]);

  // ============= 2. Client concentration (Pareto) =============
  const clientPareto = useMemo(() => {
    const byClient = new Map<string, { name: string; gross: number; contracts: number }>();
    for (const c of filteredContracts) {
      if (isCancelled(c)) continue;
      const p = contractPeriod(c)!;
      const rate = getRate(p.key);
      const grossUsd = contractGrossUsd(c, getRate, p.key);
      const val = currency === "USD" ? grossUsd : grossUsd * rate;
      const key = (c.name || "—").trim() || "—";
      const cur = byClient.get(key) ?? { name: key, gross: 0, contracts: 0 };
      cur.gross += val;
      cur.contracts += 1;
      byClient.set(key, cur);
    }
    const arr = Array.from(byClient.values()).sort((a, b) => b.gross - a.gross);
    const total = arr.reduce((s, v) => s + v.gross, 0);
    const top = arr.slice(0, 10);
    let cum = 0;
    return {
      total,
      totalClients: arr.length,
      top: top.map((v) => {
        cum += v.gross;
        return {
          name: v.name.length > 18 ? v.name.slice(0, 17) + "…" : v.name,
          fullName: v.name,
          value: Math.round(v.gross),
          contracts: v.contracts,
          share: total > 0 ? (v.gross / total) * 100 : 0,
          cum: total > 0 ? (cum / total) * 100 : 0,
        };
      }),
      top10Share: total > 0 ? (top.reduce((s, v) => s + v.gross, 0) / total) * 100 : 0,
    };
  }, [filteredContracts, currency, getRate]);

  // ============= 3. Sales manager scorecard =============
  const salesScorecard = useMemo(() => {
    const map = new Map<string, { name: string; gross: number; collected: number; contracts: number; commission: number }>();
    for (const c of filteredContracts) {
      const nm = (c.salesManager || "—").trim() || "—";
      const p = contractPeriod(c)!;
      const rate = getRate(p.key);
      const grossUsd = contractGrossUsd(c, getRate, p.key);
      const val = currency === "USD" ? grossUsd : grossUsd * rate;
      const paidUsd = Number(c.paidUsd) || 0;
      const paidVal = currency === "USD" ? paidUsd : paidUsd * rate;
      const commUsd = Number(c.commission) || 0;
      const commVal = currency === "USD" ? commUsd : commUsd * rate;
      const cur = map.get(nm) ?? { name: nm, gross: 0, collected: 0, contracts: 0, commission: 0 };
      cur.gross += val;
      cur.collected += paidVal;
      cur.commission += commVal;
      cur.contracts += 1;
      map.set(nm, cur);
    }
    return Array.from(map.values())
      .filter((v) => v.name !== "—")
      .sort((a, b) => b.gross - a.gross);
  }, [filteredContracts, currency, getRate]);

  // ============= 4. P&L Waterfall =============
  const waterfall = useMemo(() => {
    let rev = 0, doc = 0, opex = 0, salaries = 0;
    for (const p of monthlyAgg.rev.values()) rev += currency === "UZS" ? p.uzs : p.usd;
    for (const p of monthlyAgg.doc.values()) doc += currency === "UZS" ? p.uzs : p.usd;

    // expenses split: salaries vs other opex
    if (basis === "accrual") {
      for (const e of expenses) {
        const y = e.expense_date.slice(0, 4);
        const mm = e.expense_date.slice(5, 7);
        if (year !== "all" && y !== year) continue;
        if (months.length > 0 && !months.includes(Number(mm))) continue;
        const key = `${y}-${mm}`;
        const rate = getRate(key);
        const raw = Number(e.total_amount);
        const val = currency === "USD"
          ? (e.currency === "USD" ? raw : raw / rate)
          : (e.currency === "USD" ? raw * rate : raw);
        opex += val;
      }
    } else {
      const expById = new Map(expenses.map((e) => [e.id, e]));
      for (const p of payments) {
        const y = p.paid_at.slice(0, 4);
        const mm = p.paid_at.slice(5, 7);
        if (year !== "all" && y !== year) continue;
        if (months.length > 0 && !months.includes(Number(mm))) continue;
        const key = `${y}-${mm}`;
        const rate = getRate(key);
        const raw = Number(p.amount);
        const exp = expById.get(p.expense_id);
        const val = currency === "USD"
          ? (exp?.currency === "USD" ? raw : raw / rate)
          : (exp?.currency === "USD" ? raw * rate : raw);
        opex += val;
      }
    }
    void salaries;

    const grossProfit = rev - doc;
    const operatingProfit = grossProfit - opex;

    // Build waterfall steps
    const steps: Array<{ name: string; value: number; start: number; end: number; kind: "in" | "out" | "total" }> = [];
    steps.push({ name: t("finance.revenue"), value: rev, start: 0, end: rev, kind: "in" });
    steps.push({ name: t("finance.pnl.docCosts"), value: -doc, start: rev - doc, end: rev, kind: "out" });
    steps.push({ name: t("finance.grossProfit"), value: grossProfit, start: 0, end: grossProfit, kind: "total" });
    steps.push({ name: t("finance.expense"), value: -opex, start: operatingProfit, end: grossProfit, kind: "out" });
    steps.push({ name: t("finance.profit"), value: operatingProfit, start: 0, end: operatingProfit, kind: "total" });

    return { steps, rev, doc, opex, grossProfit, operatingProfit };
  }, [monthlyAgg, expenses, payments, basis, currency, year, months, getRate, t]);

  // ============= 5. KPI ratios strip =============
  const ratios = useMemo(() => {
    const { rev, doc, opex, grossProfit, operatingProfit } = waterfall;
    const grossMargin = rev > 0 ? (grossProfit / rev) * 100 : 0;
    const netMargin = rev > 0 ? (operatingProfit / rev) * 100 : 0;
    const opexRatio = rev > 0 ? (opex / rev) * 100 : 0;
    const docRatio = rev > 0 ? (doc / rev) * 100 : 0;
    const totalContracts = filteredContracts.length;
    const avgDeal = totalContracts > 0 ? rev / totalContracts : 0;
    const revPerClient = clientPareto.totalClients > 0 ? rev / clientPareto.totalClients : 0;
    return { grossMargin, netMargin, opexRatio, docRatio, avgDeal, revPerClient, totalContracts };
  }, [waterfall, filteredContracts, clientPareto]);

  const waterfallColors = {
    in: "var(--chart-1)",
    out: "var(--destructive)",
    total: "var(--primary)",
  };

  return (
    <div className="space-y-4">
      {/* KPI ratio strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <RatioCard label={t("insights.grossMargin")} value={`${ratios.grossMargin.toFixed(1)}%`} tone={ratios.grossMargin >= 30 ? "green" : ratios.grossMargin >= 15 ? "amber" : "red"} icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <RatioCard label={t("insights.netMargin")} value={`${ratios.netMargin.toFixed(1)}%`} tone={ratios.netMargin >= 15 ? "green" : ratios.netMargin >= 5 ? "amber" : "red"} icon={ratios.netMargin >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} />
        <RatioCard label={t("insights.opexRatio")} value={`${ratios.opexRatio.toFixed(1)}%`} tone={ratios.opexRatio <= 30 ? "green" : ratios.opexRatio <= 50 ? "amber" : "red"} icon={<Activity className="h-3.5 w-3.5" />} />
        <RatioCard label={t("insights.docRatio")} value={`${ratios.docRatio.toFixed(1)}%`} tone="neutral" icon={<PieIcon className="h-3.5 w-3.5" />} />
        <RatioCard label={t("insights.avgDeal")} value={fmt(ratios.avgDeal)} tone="neutral" icon={<Target className="h-3.5 w-3.5" />} sub={`${ratios.totalContracts} ${t("finance.contracts")}`} />
        <RatioCard label={t("insights.collectionRate")} value={`${overallCollection.rate.toFixed(1)}%`} tone={overallCollection.rate >= 85 ? "green" : overallCollection.rate >= 60 ? "amber" : "red"} icon={<Users className="h-3.5 w-3.5" />} sub={`${fmt(overallCollection.col)} / ${fmt(overallCollection.inv)}`} />
      </div>

      {/* P&L Waterfall */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">{t("insights.waterfall.title")}</div>
            <div className="text-xs text-muted-foreground">{t("insights.waterfall.subtitle")}</div>
          </div>
          <Badge variant="outline" className="text-[10px]">P&L</Badge>
        </div>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={waterfall.steps} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 11 }} width={80} />
              <Tooltip
                formatter={(_v, _n, item) => {
                  const p = item.payload as { value: number };
                  return [fmt(Math.abs(p.value)), item.payload.name];
                }}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              {/* invisible floor (start) */}
              <Bar dataKey="start" stackId="wf" fill="transparent" />
              {/* delta segment */}
              <Bar dataKey={(d: { end: number; start: number }) => Math.abs(d.end - d.start)} stackId="wf" name={t("insights.waterfall.segment")} radius={[4, 4, 0, 0]}>
                {waterfall.steps.map((s, i) => (
                  <Cell key={i} fill={waterfallColors[s.kind]} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Collection efficiency */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold">{t("insights.collection.title")}</div>
              <div className="text-xs text-muted-foreground">{t("insights.collection.subtitle")}</div>
            </div>
            <Badge variant={overallCollection.rate >= 80 ? "default" : "secondary"} className="text-[10px]">
              {overallCollection.rate.toFixed(1)}%
            </Badge>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={collectionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 11 }} width={70} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} width={40} />
                <Tooltip
                  formatter={(v: number, _n: string, item: any) => {
                    const dk = item?.dataKey;
                    if (dk === "rate") return [`${Number(v).toFixed(1)}%`, t("insights.collection.rate")];
                    if (dk === "invoiced") return [fmt(Number(v)), t("insights.collection.invoiced")];
                    return [fmt(Number(v)), t("insights.collection.collected")];
                  }}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="invoiced" fill="var(--chart-2)" name={t("insights.collection.invoiced")} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="left" dataKey="collected" fill="var(--chart-1)" name={t("insights.collection.collected")} radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="rate" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} name={t("insights.collection.rate")} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Client Pareto */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold">{t("insights.pareto.title")}</div>
              <div className="text-xs text-muted-foreground">
                {t("insights.pareto.top10")}: <span className="font-semibold text-foreground">{clientPareto.top10Share.toFixed(1)}%</span> · {clientPareto.totalClients} {t("insights.pareto.clients")}
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">80/20</Badge>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={clientPareto.top} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis yAxisId="left" tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 11 }} width={70} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} width={40} />
                <Tooltip
                  formatter={(v: number, n: string, item) => {
                    if (n === "cum") return [`${(v as number).toFixed(1)}%`, t("insights.pareto.cumulative")];
                    return [fmt(v), item.payload.fullName];
                  }}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar yAxisId="left" dataKey="value" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="cum" stroke="var(--destructive)" strokeWidth={2} dot={{ r: 3 }} name={t("insights.pareto.cumulative")} />
                <ReferenceLine yAxisId="right" y={80} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Sales manager scorecard */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">{t("insights.scorecard.title")}</div>
            <div className="text-xs text-muted-foreground">{t("insights.scorecard.subtitle")}</div>
          </div>
          <Badge variant="outline" className="text-[10px]">{salesScorecard.length}</Badge>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("insights.scorecard.manager")}</TableHead>
                <TableHead className="text-right">{t("finance.contracts")}</TableHead>
                <TableHead className="text-right">{t("insights.scorecard.revenue")}</TableHead>
                <TableHead className="text-right">{t("insights.scorecard.avgDeal")}</TableHead>
                <TableHead className="text-right">{t("insights.scorecard.commission")}</TableHead>
                <TableHead className="text-right">{t("insights.scorecard.collected")}</TableHead>
                <TableHead className="text-right">{t("insights.scorecard.collectionRate")}</TableHead>
                <TableHead className="text-right">{t("insights.scorecard.share")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesScorecard.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>
              ) : (() => {
                const totalGross = salesScorecard.reduce((s, v) => s + v.gross, 0);
                return salesScorecard.map((s) => {
                  const avg = s.contracts > 0 ? s.gross / s.contracts : 0;
                  const rate = s.gross > 0 ? (s.collected / s.gross) * 100 : 0;
                  const share = totalGross > 0 ? (s.gross / totalGross) * 100 : 0;
                  const rateTone = rate >= 85 ? "text-emerald-600 dark:text-emerald-400" : rate >= 60 ? "text-amber-600 dark:text-amber-400" : "text-destructive";
                  return (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.contracts}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s.gross)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(avg)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(s.commission)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s.collected)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-semibold", rateTone)}>{rate.toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{share.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function RatioCard({
  label, value, sub, tone = "neutral", icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "red" | "amber" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "green" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "red" ? "text-destructive"
    : tone === "amber" ? "text-amber-600 dark:text-amber-400"
    : "text-foreground";
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className={toneCls}>{icon}</span>
      </div>
      <div className={cn("mt-1 text-base font-bold tabular-nums", toneCls)}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{sub}</div>}
    </Card>
  );
}
