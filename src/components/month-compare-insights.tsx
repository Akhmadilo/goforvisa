import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, TrendingDown, Minus, Lightbulb, AlertTriangle, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAiInsight } from "@/lib/ai-insights.functions";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useUsdRates } from "@/lib/usd-rates";
import { useT, getMonthNames } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Metrics = {
  revenue: number;
  contracts: number;
  expenses: number;
  salaries: number;
  fines: number;
  cats: Record<string, number>;
};

const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const fmtUzs = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} so'm`;
const pct = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / Math.abs(prev)) * 100);

/** Rule-based month-over-month comparison of revenue, expenses, payroll, fines and contracts. */
export function MonthCompareInsights() {
  const { t, lang } = useT() as any;
  const months = getMonthNames(lang);
  const now = new Date();
  const [sel, setSel] = useState(ym(now.getFullYear(), now.getMonth() + 1));
  const [y, m] = sel.split("-").map(Number) as [number, number];
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const ppy = pm === 1 ? py - 1 : py;
  const ppm = pm === 1 ? 12 : pm - 1;
  const from = `${ppy}-${String(ppm).padStart(2, "0")}-01`;
  const toD = new Date(y, m, 1);
  const to = `${toD.getFullYear()}-${String(toD.getMonth() + 1).padStart(2, "0")}-01`;
  const { getRate } = useUsdRates();

  const { data } = useQuery({
    queryKey: ["mom-insights", sel],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const [pay, con, exp, sal, fin] = await Promise.all([
        supabase.from("contract_payments").select("amount,currency,paid_at").gte("paid_at", from).lt("paid_at", to),
        supabase.from("contracts").select("contract_date").gte("contract_date", from).lt("contract_date", to),
        supabase.from("expenses").select("total_amount,currency,expense_date,category").gte("expense_date", from).lt("expense_date", to),
        supabase.from("salaries").select("year,month,fixed_amount,kpi_amount,penalty_amount").in("year", [ppy, py, y]),
        supabase.from("fines").select("amount_uzs,date").gte("date", from).lt("date", to),
      ]);
      return { pay: pay.data ?? [], con: con.data ?? [], exp: exp.data ?? [], sal: sal.data ?? [], fin: fin.data ?? [] };
    },
  });

  const { cur, prev, prev2 } = useMemo(() => {
    const blank = (): Metrics => ({ revenue: 0, contracts: 0, expenses: 0, salaries: 0, fines: 0, cats: {} });
    const out: Record<string, Metrics> = { [sel]: blank(), [ym(py, pm)]: blank(), [ym(ppy, ppm)]: blank() };
    const toUzs = (amt: number, cur: string, key: string) => (cur?.toUpperCase() === "USD" ? amt * getRate(key) : amt);
    if (data) {
      for (const p of data.pay as any[]) { const k = String(p.paid_at).slice(0, 7); if (out[k]) out[k].revenue += toUzs(Number(p.amount), p.currency, k); }
      for (const c of data.con as any[]) { const k = String(c.contract_date).slice(0, 7); if (out[k]) out[k].contracts += 1; }
      for (const e of data.exp as any[]) {
        const k = String(e.expense_date).slice(0, 7); if (!out[k]) continue;
        const v = toUzs(Number(e.total_amount), e.currency, k);
        out[k].expenses += v; out[k].cats[e.category] = (out[k].cats[e.category] ?? 0) + v;
      }
      for (const s of data.sal as any[]) { const k = ym(s.year, s.month); if (out[k]) out[k].salaries += Number(s.fixed_amount) + Number(s.kpi_amount) - Number(s.penalty_amount); }
      for (const f of data.fin as any[]) { const k = String(f.date).slice(0, 7); if (out[k]) out[k].fines += Number(f.amount_uzs); }
    }
    return { cur: out[sel]!, prev: out[ym(py, pm)]!, prev2: out[ym(ppy, ppm)]! };
  }, [data, sel, py, pm, ppy, ppm, getRate]);

  const net = (x: Metrics) => x.revenue - x.expenses - x.salaries;

  // Baseline = average of the two previous months.
  const base: Metrics = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const c of new Set([...Object.keys(prev.cats), ...Object.keys(prev2.cats)])) cats[c] = ((prev.cats[c] ?? 0) + (prev2.cats[c] ?? 0)) / 2;
    return {
      revenue: (prev.revenue + prev2.revenue) / 2,
      contracts: (prev.contracts + prev2.contracts) / 2,
      expenses: (prev.expenses + prev2.expenses) / 2,
      salaries: (prev.salaries + prev2.salaries) / 2,
      fines: (prev.fines + prev2.fines) / 2,
      cats,
    };
  }, [prev, prev2]);

  const insights = useMemo(() => {
    const list: { tone: "good" | "bad" | "info"; text: string }[] = [];
    const r = pct(cur.revenue, base.revenue), e = pct(cur.expenses, base.expenses), s = pct(cur.salaries, base.salaries);
    const p = (v: number) => Math.abs(v).toFixed(1);
    if (Math.abs(r) >= 5) list.push({ tone: r > 0 ? "good" : "bad", text: t(r > 0 ? "mom.i.revUp" : "mom.i.revDown", { p: p(r) }) });
    if (Math.abs(e) >= 5) list.push({ tone: e > 0 ? "bad" : "good", text: t(e > 0 ? "mom.i.expUp" : "mom.i.expDown", { p: p(e) }) });
    if (e > r + 5 && cur.expenses > 0) list.push({ tone: "bad", text: t("mom.i.expFaster") });
    if (Math.abs(s) >= 5) list.push({ tone: "info", text: t(s > 0 ? "mom.i.salUp" : "mom.i.salDown", { p: p(s) }) });
    if (cur.revenue > 0 && cur.salaries > 0) {
      const ratio = (cur.salaries / cur.revenue) * 100;
      list.push({ tone: ratio > 40 ? "bad" : "good", text: t(ratio > 40 ? "mom.i.salRatio" : "mom.i.salRatioOk", { p: ratio.toFixed(1) }) });
    }
    let top = "", topV = 0;
    for (const [c, v] of Object.entries(cur.cats)) { const d = v - (base.cats[c] ?? 0); if (d > topV) { topV = d; top = c; } }
    if (top) list.push({ tone: "info", text: t("mom.i.topCat", { c: top, v: fmtUzs(topV) }) });
    if (cur.contracts !== Math.round(base.contracts)) list.push({ tone: cur.contracts > base.contracts ? "good" : "bad", text: t(cur.contracts > base.contracts ? "mom.i.contractsUp" : "mom.i.contractsDown", { a: Math.round(base.contracts), b: cur.contracts }) });
    const f = pct(cur.fines, base.fines);
    if (f >= 20 && cur.fines > 0) list.push({ tone: "bad", text: t("mom.i.finesUp", { p: p(f) }) });
    if (f <= -20 && base.fines > 0) list.push({ tone: "good", text: t("mom.i.finesDown", { p: p(f) }) });
    // 3-month consistent trends
    if (prev2.revenue > 0 && prev2.revenue < prev.revenue && prev.revenue < cur.revenue) list.push({ tone: "good", text: t("mom.i.revTrendUp") });
    if (prev2.revenue > 0 && prev2.revenue > prev.revenue && prev.revenue > cur.revenue) list.push({ tone: "bad", text: t("mom.i.revTrendDown") });
    if (prev2.expenses > 0 && prev2.expenses < prev.expenses && prev.expenses < cur.expenses) list.push({ tone: "bad", text: t("mom.i.expTrendUp") });
    // Average revenue per contract
    if (cur.contracts > 0 && base.contracts > 0) {
      const a = cur.revenue / cur.contracts, b = base.revenue / base.contracts;
      const d = pct(a, b);
      if (Math.abs(d) >= 10) list.push({ tone: d > 0 ? "good" : "bad", text: t(d > 0 ? "mom.i.avgUp" : "mom.i.avgDown", { v: fmtUzs(a), p: p(d) }) });
    }
    if (cur.contracts > base.contracts && r < -5) list.push({ tone: "bad", text: t("mom.i.contractsUpRevDown") });
    // Expense ratio
    if (cur.revenue > 0 && cur.expenses > 0) {
      const er = (cur.expenses / cur.revenue) * 100;
      if (er > 50) list.push({ tone: "bad", text: t("mom.i.expRatio", { p: er.toFixed(1) }) });
    }
    // Category concentration & biggest saving
    if (cur.expenses > 0) {
      const [bc, bv] = Object.entries(cur.cats).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
      if (bc && bv / cur.expenses > 0.4) list.push({ tone: "info", text: t("mom.i.catConc", { c: bc, p: ((bv / cur.expenses) * 100).toFixed(1) }) });
    }
    let low = "", lowV = 0;
    for (const [c, v] of Object.entries(base.cats)) { const d = (cur.cats[c] ?? 0) - v; if (d < lowV) { lowV = d; low = c; } }
    if (low) list.push({ tone: "good", text: t("mom.i.catSaved", { c: low, v: fmtUzs(-lowV) }) });
    // Margin change vs last month (percentage points)
    if (cur.revenue > 0 && prev.revenue > 0) {
      const mc = (net(cur) / cur.revenue) * 100, mp = (net(prev) / prev.revenue) * 100;
      if (Math.abs(mc - mp) >= 3) list.push({ tone: mc > mp ? "good" : "bad", text: t(mc > mp ? "mom.i.marginUp" : "mom.i.marginDown", { p: Math.abs(mc - mp).toFixed(1) }) });
    }
    const n = net(cur);
    if (cur.revenue > 0 || cur.expenses > 0) list.push(n < 0
      ? { tone: "bad", text: t("mom.i.netLoss", { v: fmtUzs(n) }) }
      : { tone: "good", text: t("mom.i.netProfit", { v: fmtUzs(n), p: cur.revenue ? ((n / cur.revenue) * 100).toFixed(1) : "0" }) });
    if (!list.length) list.push({ tone: "info", text: t("mom.i.stable") });
    return list;
  }, [cur, prev, prev2, base, t]);

  const genAi = useServerFn(generateAiInsight);
  const aiKey = `ai-insight:${sel}:${lang}`;
  const [ai, setAi] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  useEffect(() => { setAi(localStorage.getItem(aiKey)); setAiErr(null); }, [aiKey]);
  const runAi = async () => {
    setAiLoading(true); setAiErr(null);
    try {
      const lines = [
        ["Revenue", prev2.revenue, prev.revenue, cur.revenue], ["New contracts", prev2.contracts, prev.contracts, cur.contracts],
        ["Expenses", prev2.expenses, prev.expenses, cur.expenses], ["Payroll", prev2.salaries, prev.salaries, cur.salaries],
        ["Fines", prev2.fines, prev.fines, cur.fines], ["Net", net(prev2), net(prev), net(cur)],
      ].map((l) => `${l[0]}: ${l.slice(1).map((v) => Math.round(Number(v))).join(" | ")}`).join("\n");
      const cats = Object.entries(cur.cats).map(([c, v]) => `${c}: ${Math.round(v)} (baseline ${Math.round(base.cats[c] ?? 0)})`).join("\n");
      const res = await genAi({ data: { lang, period: `${months[ppm - 1]} ${ppy} | ${months[pm - 1]} ${py} | ${months[m - 1]} ${y}`, data: `${lines}\n\nExpense categories current month:\n${cats}\n\nRule-based findings:\n${insights.map((i) => "- " + i.text).join("\n")}` } });
      setAi(res.text); localStorage.setItem(aiKey, res.text);
    } catch (e: any) { setAiErr(e?.message ?? "Error"); } finally { setAiLoading(false); }
  };

  const rows: { key: string; c: number; p: number; p2: number; count?: boolean; inverse?: boolean }[] = [
    { key: "mom.m.revenue", c: cur.revenue, p: prev.revenue, p2: prev2.revenue },
    { key: "mom.m.contracts", c: cur.contracts, p: prev.contracts, p2: prev2.contracts, count: true },
    { key: "mom.m.expenses", c: cur.expenses, p: prev.expenses, p2: prev2.expenses, inverse: true },
    { key: "mom.m.salaries", c: cur.salaries, p: prev.salaries, p2: prev2.salaries, inverse: true },
    { key: "mom.m.fines", c: cur.fines, p: prev.fines, p2: prev2.fines },
    { key: "mom.m.net", c: net(cur), p: net(prev), p2: net(prev2) },
  ];

  const options = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return ym(d.getFullYear(), d.getMonth() + 1);
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" />{t("mom.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("mom.subtitle", { cur: `${months[m - 1]} ${y}`, prev: `${months[pm - 1]} ${py}`, prev2: `${months[ppm - 1]} ${ppy}` })}</p>
        </div>
        <select aria-label={t("mom.month")} value={sel} onChange={(e) => setSel(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          {options.map((o) => { const [oy, om] = o.split("-").map(Number); return <option key={o} value={o}>{months[om! - 1]} {oy}</option>; })}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground border-b border-border">
              <th className="text-left py-2">{t("mom.metric")}</th><th className="text-right">{months[ppm - 1]}</th><th className="text-right">{months[pm - 1]}</th><th className="text-right">{months[m - 1]}</th><th className="text-right">{t("mom.change")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const ch = pct(r.c, r.p);
                const good = r.inverse ? ch < 0 : ch > 0;
                const Icon = Math.abs(ch) < 0.5 ? Minus : ch > 0 ? TrendingUp : TrendingDown;
                return (
                  <tr key={r.key} className="border-b border-border/50">
                    <td className="py-2">{t(r.key)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{r.count ? r.p2 : fmtUzs(r.p2)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{r.count ? r.p : fmtUzs(r.p)}</td>
                    <td className="text-right tabular-nums font-medium">{r.count ? r.c : fmtUzs(r.c)}</td>
                    <td className={cn("text-right tabular-nums", Math.abs(ch) < 0.5 ? "text-muted-foreground" : good ? "text-primary" : "text-destructive")}>
                      <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{ch > 0 ? "+" : ""}{ch.toFixed(1)}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">{t("mom.conclusions")}</div>
          {insights.map((i, idx) => {
            const Icon = i.tone === "good" ? CheckCircle2 : i.tone === "bad" ? AlertTriangle : Lightbulb;
            return (
              <div key={idx} className={cn("flex gap-2 rounded-md border p-2.5 text-sm",
                i.tone === "good" ? "border-primary/30 bg-primary/5" : i.tone === "bad" ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/40")}>
                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", i.tone === "good" ? "text-primary" : i.tone === "bad" ? "text-destructive" : "text-muted-foreground")} />
                <span>{i.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
