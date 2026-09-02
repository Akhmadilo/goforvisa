import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Row = {
  key: string;
  name: string;
  inflow: number;
  opex: number;
  salaries: number;
  outflow: number;
  net: number;
  cumulative: number;
};

export function CashFlowStatement({
  year, months, currency, getRate, fmt, monthNames, enabled,
}: {
  year: string;
  months: number[];
  currency: "UZS" | "USD";
  getRate: (ym: string) => number;
  fmt: (n: number) => string;
  monthNames: string[];
  enabled: boolean;
}) {
  const { t } = useT();
  const { data: contractPays = [] } = useQuery({
    queryKey: ["cf-contract-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments").select("amount, currency, paid_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });

  const { data: expensePays = [] } = useQuery({
    queryKey: ["cf-expense-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_payments").select("amount, paid_at, expenses(currency)");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });

  const { data: salaryPays = [] } = useQuery({
    queryKey: ["cf-salary-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_payments").select("amount, paid_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });

  const rows = useMemo<Row[]>(() => {
    const inMonth = new Map<string, { in: number; opex: number; sal: number }>();
    const bump = (key: string, field: "in" | "opex" | "sal", v: number) => {
      const cur = inMonth.get(key) ?? { in: 0, opex: 0, sal: 0 };
      cur[field] += v;
      inMonth.set(key, cur);
    };
    const inScope = (date: string) => {
      if (!date || date.length < 7) return null;
      const y = date.slice(0, 4);
      const mm = date.slice(5, 7);
      if (year !== "all" && y !== year) return null;
      if (months.length > 0 && !months.includes(Number(mm))) return null;
      return `${y}-${mm}`;
    };
    const conv = (raw: number, isUsd: boolean, key: string) => {
      const rate = getRate(key) || 1;
      if (currency === "USD") return isUsd ? raw : raw / rate;
      return isUsd ? raw * rate : raw;
    };

    for (const p of contractPays as any[]) {
      const key = inScope(String(p.paid_at ?? ""));
      if (!key) continue;
      bump(key, "in", conv(Number(p.amount) || 0, (p.currency ?? "UZS") === "USD", key));
    }
    for (const p of expensePays as any[]) {
      const key = inScope(String(p.paid_at ?? ""));
      if (!key) continue;
      const isUsd = (p.expenses?.currency ?? "UZS") === "USD";
      bump(key, "opex", conv(Number(p.amount) || 0, isUsd, key));
    }
    for (const p of salaryPays as any[]) {
      const key = inScope(String(p.paid_at ?? ""));
      if (!key) continue;
      bump(key, "sal", conv(Number(p.amount) || 0, false, key));
    }

    const keys = Array.from(inMonth.keys()).sort();
    let cum = 0;
    return keys.map((k) => {
      const v = inMonth.get(k)!;
      const outflow = v.opex + v.sal;
      const net = v.in - outflow;
      cum += net;
      const [y, mm] = k.split("-");
      return {
        key: k,
        name: `${(monthNames[Number(mm) - 1] ?? mm).slice(0, 3)} ${y.slice(2)}`,
        inflow: Math.round(v.in),
        opex: Math.round(v.opex),
        salaries: Math.round(v.sal),
        outflow: Math.round(outflow),
        net: Math.round(net),
        cumulative: Math.round(cum),
      };
    });
  }, [contractPays, expensePays, salaryPays, year, months, currency, getRate, monthNames]);

  const totals = useMemo(() => {
    return rows.reduce(
      (s, r) => ({
        inflow: s.inflow + r.inflow,
        opex: s.opex + r.opex,
        salaries: s.salaries + r.salaries,
        outflow: s.outflow + r.outflow,
        net: s.net + r.net,
      }),
      { inflow: 0, opex: 0, salaries: 0, outflow: 0, net: 0 },
    );
  }, [rows]);

  const closing = rows.length ? rows[rows.length - 1].cumulative : 0;
  const short = (n: number) =>
    Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
      : Math.abs(n) >= 1_000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));

  return (
    <Card className="p-4 md:p-6 border-border/70 bg-card/80" data-export-block>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20 flex items-center justify-center">
            <Wallet className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold">{t("cf.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("cf.subtitle")}</p>
          </div>
        </div>
        <Badge variant="outline" className={cn(
          "tabular-nums",
          closing >= 0 ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40" : "text-rose-600 dark:text-rose-400 border-rose-500/40",
        )}>
          {t("cf.closingBalance")}: {fmt(closing)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <MiniStat label={t("cf.inflow")} value={fmt(totals.inflow)} tone="green" icon={<ArrowDownCircle className="h-4 w-4" />} />
        <MiniStat label={t("cf.opex")} value={fmt(totals.opex)} tone="red" icon={<ArrowUpCircle className="h-4 w-4" />} />
        <MiniStat label={t("cf.salaries")} value={fmt(totals.salaries)} tone="amber" icon={<ArrowUpCircle className="h-4 w-4" />} />
        <MiniStat label={t("cf.netFlow")} value={fmt(totals.net)} tone={totals.net >= 0 ? "green" : "red"} icon={<Wallet className="h-4 w-4" />} />
      </div>

      <div className="h-[300px] w-full mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.25)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="rgb(100 116 139)" />
            <YAxis tickFormatter={short} tick={{ fontSize: 11 }} stroke="rgb(100 116 139)" width={56} />
            <Tooltip
              formatter={(v: any, n: any) => [fmt(Number(v)), n]}
              contentStyle={{ background: "rgb(255 255 255)", border: "1px solid rgb(203 213 225)", borderRadius: 8, fontSize: 12, color: "rgb(15 23 42)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="rgb(100 116 139)" />
            <Bar dataKey="inflow" name={t("cf.chart.inflow")} fill="rgb(16 185 129)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="outflow" name={t("cf.chart.outflow")} fill="rgb(244 63 94)" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="cumulative" name={t("cf.chart.cumulative")} stroke="rgb(14 165 233)" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("cf.th.month")}</TableHead>
              <TableHead className="text-right">{t("cf.th.clientInflow")}</TableHead>
              <TableHead className="text-right">{t("cf.th.opex")}</TableHead>
              <TableHead className="text-right">{t("cf.th.salaries")}</TableHead>
              <TableHead className="text-right">{t("cf.th.totalOutflow")}</TableHead>
              <TableHead className="text-right">{t("cf.th.net")}</TableHead>
              <TableHead className="text-right">{t("cf.th.cumulative")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  {t("cf.empty")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(r.inflow)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.opex)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.salaries)}</TableCell>
                <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{fmt(r.outflow)}</TableCell>
                <TableCell className={cn(
                  "text-right tabular-nums font-semibold",
                  r.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                )}>{fmt(r.net)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.cumulative)}</TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>{t("cf.total")}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.inflow)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.opex)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.salaries)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.outflow)}</TableCell>
                <TableCell className={cn(
                  "text-right tabular-nums",
                  totals.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                )}>{fmt(totals.net)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(closing)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function MiniStat({
  label, value, tone, icon,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "amber";
  icon: React.ReactNode;
}) {
  const tones = {
    green: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
    red: "text-rose-600 dark:text-rose-400 bg-rose-500/10 ring-rose-500/20",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10 ring-amber-500/20",
  } as const;
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex items-center gap-2">
        <span className={cn("h-7 w-7 rounded-lg ring-1 flex items-center justify-center", tones[tone])}>{icon}</span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5 text-base md:text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
