import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/app-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, PhoneCall, TrendingUp, Briefcase, CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useT, localeOf, getMonthNames } from "@/lib/i18n";
import { useUsdRates } from "@/lib/usd-rates";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/kpi")({
  component: KpiPage,
  head: () => ({
    meta: [
      { title: "KPI — GoForVisa" },
      { name: "description", content: "Ishchilar KPI ko'rsatkichlari" },
    ],
  }),
});


// Call-centre: base salary and KPI % are independent ladders.
const BASE_TIERS: { min: number; max: number; base: number }[] = [
  { min: 1, max: 5, base: 1_000_000 },
  { min: 6, max: 10, base: 2_000_000 },
  { min: 11, max: 15, base: 2_500_000 },
  { min: 16, max: 20, base: 3_000_000 },
  { min: 21, max: 25, base: 3_500_000 },
  { min: 26, max: Infinity, base: 4_000_000 },
];

const KPI_PCT_TIERS: { min: number; max: number; kpi: number }[] = [
  { min: 10, max: 14, kpi: 5 },
  { min: 15, max: 19, kpi: 10 },
  { min: 20, max: 24, kpi: 15 },
  { min: 25, max: 29, kpi: 20 },
  { min: 30, max: Infinity, kpi: 25 },
];

function baseFor(count: number) {
  if (count <= 0) return 0;
  return (BASE_TIERS.find((t) => count >= t.min && count <= t.max) ?? BASE_TIERS[0]).base;
}
function kpiPctFor(count: number) {
  return (KPI_PCT_TIERS.find((t) => count >= t.min && count <= t.max)?.kpi) ?? 0;
}


// Sales rate is per-manager (sales_kpi_rates); default fallback handled inline.


function SectionPlaceholder({ title, icon: Icon }: { title: string; icon: typeof PhoneCall }) {
  return (
    <Card className="p-8 md:p-12">
      <div className="flex flex-col items-center text-center gap-3 text-muted-foreground">
        <Icon className="h-10 w-10 text-primary/60" />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm max-w-md">
          Bu bo'lim uchun KPI tizimi tez orada qo'shiladi.
        </p>
      </div>
    </Card>
  );
}

function PeriodPicker({
  year, month, setYear, setMonth,
}: { year: string; month: string; setYear: (v: string) => void; setMonth: (v: string) => void }) {
  const { lang } = useT();
  const now = new Date();
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 2 + i));
  const months = getMonthNames(lang);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Davr</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}

function CallCentreKpi() {
  const { lang } = useT();
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));

  const { data: contracts } = useQuery({
    queryKey: ["kpi-cc-contracts", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, call_centre, year, month, visa_result")
        .eq("year", year)
        .eq("month", month);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const map = new Map<string, number>();
    (contracts ?? []).forEach((c: { call_centre: string | null; visa_result: string | null }) => {
      const name = (c.call_centre ?? "").trim();
      if (!name) return;
      if (c.visa_result === "Bekor qilindi" || c.visa_result === "To'xtatildi") return;
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    const list = Array.from(map.entries()).map(([name, count]) => {
      const base = baseFor(count);
      const kpi = kpiPctFor(count);
      const bonus = Math.round((base * kpi) / 100);
      const total = base + bonus;
      return { name, count, base, kpi, bonus, total };
    });

    list.sort((a, b) => b.count - a.count);
    return list;
  }, [contracts]);

  const fmt = (n: number) => n.toLocaleString(localeOf(lang));

  return (
    <div className="space-y-4">
      <PeriodPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Asosiy oylik (sotuv soni bo'yicha)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sotuv soni</TableHead>
                  <TableHead>Asosiy oylik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BASE_TIERS.map((t) => (
                  <TableRow key={t.min}>
                    <TableCell>{t.max === Infinity ? `${t.min}+` : `${t.min}–${t.max}`}</TableCell>
                    <TableCell>{fmt(t.base)} so'm</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">KPI % (sotuv soni bo'yicha)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sotuv soni</TableHead>
                  <TableHead>KPI %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {KPI_PCT_TIERS.map((t) => (
                  <TableRow key={t.min}>
                    <TableCell>{t.max === Infinity ? `${t.min}+` : `${t.min}–${t.max}`}</TableCell>
                    <TableCell>{t.kpi}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Call-operatorlar oyligi</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call-operator</TableHead>
                  <TableHead className="text-right">Shartnoma</TableHead>
                  <TableHead className="text-right">Asosiy oylik</TableHead>
                  <TableHead className="text-right">KPI %</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Umumiy oylik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Bu davr uchun ma'lumot yo'q</TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{fmt(r.base)}</TableCell>
                    <TableCell className="text-right">{r.kpi}%</TableCell>
                    <TableCell className="text-right">{fmt(r.bonus)}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{fmt(r.total)} so'm</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SalesKpi() {
  const { lang } = useT();
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { getRate } = useUsdRates();
  const isAdmin = useIsAdmin();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fmt = (n: number) => n.toLocaleString(localeOf(lang));

  const { data: contracts } = useQuery({
    queryKey: ["kpi-sales-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, client_name, contract_no, sales_manager, price_usd, commission, visa_result");
      if (error) throw error;
      return data ?? [];
    },
  });

  const contractIds = useMemo(() => (contracts ?? []).map((c: any) => c.id), [contracts]);

  const { data: payments } = useQuery({
    queryKey: ["kpi-sales-payments", contractIds.length],
    enabled: contractIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments")
        .select("contract_id, amount, currency, paid_at")
        .in("contract_id", contractIds)
        .order("paid_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rates } = useQuery({
    queryKey: ["sales_kpi_rates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sales_kpi_rates").select("*");
      if (error) throw error;
      return (data ?? []) as { manager_name: string; rate_per_usd: number }[];
    },
  });

  const { data: approvals } = useQuery({
    queryKey: ["sales_kpi_approvals"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sales_kpi_approvals").select("*");
      if (error) throw error;
      return (data ?? []) as { contract_id: string; approved_year: number; approved_month: number; bonus_uzs: number; status: "approved" | "rejected" }[];
    },
  });

  const rateFor = (name: string): number => {
    const r = (rates ?? []).find((x) => x.manager_name === name);
    return r ? Number(r.rate_per_usd) : 500;
  };

  const setRate = useMutation({
    mutationFn: async ({ name, rate }: { name: string; rate: number }) => {
      const { error } = await (supabase as any)
        .from("sales_kpi_rates")
        .upsert({ manager_name: name, rate_per_usd: rate }, { onConflict: "manager_name" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_rates"] });
      toast.success("Saqlandi");
    },
    onError: (e: any) => toast.error(e.message ?? "Xato"),
  });

  const setStatus = useMutation({
    mutationFn: async (payload: { contract_id: string; manager_name: string; year: number; month: number; bonus: number; status: "approved" | "rejected" }) => {
      const { error } = await (supabase as any).from("sales_kpi_approvals").upsert(
        {
          contract_id: payload.contract_id,
          manager_name: payload.manager_name,
          approved_year: payload.year,
          approved_month: payload.month,
          bonus_uzs: payload.bonus,
          status: payload.status,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
        },
        { onConflict: "contract_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_approvals"] });
      toast.success(vars.status === "approved" ? "KPI tasdiqlandi" : "KPI berilmaydi");
    },
    onError: (e: any) => toast.error(e.message ?? "Xato"),
  });

  const clearStatus = useMutation({
    mutationFn: async (contract_id: string) => {
      const { error } = await (supabase as any).from("sales_kpi_approvals").delete().eq("contract_id", contract_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_approvals"] });
      toast.success("Bekor qilindi");
    },
  });


  // Compute completed contracts in selected month and group by manager
  const managerGroups = useMemo(() => {
    if (!contracts || !payments) return [];
    const yNum = Number(year);
    const mNum = Number(month);
    const byContract = new Map<string, any[]>();
    for (const p of payments as any[]) {
      const arr = byContract.get(p.contract_id) ?? [];
      arr.push(p);
      byContract.set(p.contract_id, arr);
    }

    type Item = {
      id: string;
      client: string;
      contractNo: string | null;
      commissionUsd: number;
      bonus: number;
      completedAt: string;
    };
    const groups = new Map<string, Item[]>();

    for (const c of contracts as any[]) {
      const name = (c.sales_manager ?? "").trim();
      if (!name) continue;
      if (c.visa_result === "Bekor qilindi" || c.visa_result === "To'xtatildi") continue;
      const price = Number(c.price_usd ?? 0);
      const commissionUsd = Number(c.commission ?? 0);
      if (price <= 0 || commissionUsd <= 0) continue;
      const ps = byContract.get(c.id) ?? [];
      let running = 0;
      let completionDate: string | null = null;
      for (const p of ps) {
        const amt = Number(p.amount ?? 0);
        const ym = (p.paid_at as string).slice(0, 7);
        const usd = (p.currency ?? "UZS") === "USD" ? amt : amt / getRate(ym);
        running += usd;
        if (running >= price - 0.01) {
          completionDate = p.paid_at;
          break;
        }
      }
      if (!completionDate) continue;
      const d = new Date(completionDate);
      if (d.getFullYear() !== yNum || d.getMonth() + 1 !== mNum) continue;
      const rate = rateFor(name);
      const bonus = Math.round(commissionUsd * rate);
      const arr = groups.get(name) ?? [];
      arr.push({
        id: c.id,
        client: c.client_name,
        contractNo: c.contract_no,
        commissionUsd,
        bonus,
        completedAt: completionDate,
      });
      groups.set(name, arr);
    }

    const approvedSet = new Set((approvals ?? []).filter((a) => a.status === "approved").map((a) => a.contract_id));
    const rejectedSet = new Set((approvals ?? []).filter((a) => a.status === "rejected").map((a) => a.contract_id));
    return Array.from(groups.entries())
      .map(([name, items]) => {
        const approvedTotal = items.filter((i) => approvedSet.has(i.id)).reduce((s, i) => s + i.bonus, 0);
        const rejectedTotal = items.filter((i) => rejectedSet.has(i.id)).reduce((s, i) => s + i.bonus, 0);
        const pendingTotal = items
          .filter((i) => !approvedSet.has(i.id) && !rejectedSet.has(i.id))
          .reduce((s, i) => s + i.bonus, 0);
        return { name, items, approvedTotal, pendingTotal, rejectedTotal, total: approvedTotal + pendingTotal };
      })
      .sort((a, b) => b.total - a.total);
  }, [contracts, payments, year, month, getRate, rates, approvals]);

  const approvedSet = useMemo(() => new Set((approvals ?? []).filter((a) => a.status === "approved").map((a) => a.contract_id)), [approvals]);
  const rejectedSet = useMemo(() => new Set((approvals ?? []).filter((a) => a.status === "rejected").map((a) => a.contract_id)), [approvals]);


  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <PeriodPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Formula</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Har sales menejer uchun komissiyaning <b className="text-foreground">har $1</b> i = <b className="text-foreground">belgilangan stavka</b> (default 500 so'm = 50 000/$100).
          Bonus shartnoma 100% to'lab bo'lingan oyda hisoblanadi (masalan, apreldagi mijoz iyunda yopilsa, iyunga tushadi).
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Sales menejerlar stavkasi (so'm / $1)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manager</TableHead>
                    <TableHead className="w-48">Stavka (so'm/$)</TableHead>
                    <TableHead className="text-right">Ekvivalent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managerGroups.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Bu oyda manejerlar yo'q</TableCell></TableRow>
                  ) : managerGroups.map((g) => {
                    const cur = rateFor(g.name);
                    return (
                      <TableRow key={g.name}>
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell>
                          <RateEditor
                            initial={cur}
                            onSave={(v) => setRate.mutate({ name: g.name, rate: v })}
                          />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">{fmt(cur * 100)} so'm / $100</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {managerGroups.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Bu oyda to'liq to'lov amalga oshmagan</CardContent></Card>
      ) : managerGroups.map((g) => {
        const isOpen = expanded.has(g.name);
        return (
          <Card key={g.name}>
            <CardHeader className="pb-3 cursor-pointer" onClick={() => toggle(g.name)}>
              <div className="flex flex-wrap items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CardTitle className="text-base">{g.name}</CardTitle>
                <Badge variant="secondary">{g.items.length} shartnoma</Badge>
                <div className="ml-auto flex flex-wrap gap-2 text-sm">
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Tasdiqlangan: {fmt(g.approvedTotal)} so'm</Badge>
                  {g.pendingTotal > 0 && <Badge variant="outline">Kutilmoqda: {fmt(g.pendingTotal)} so'm</Badge>}
                  <Badge className="bg-primary text-primary-foreground">Jami: {fmt(g.total)} so'm</Badge>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mijoz</TableHead>
                        <TableHead>Shartnoma №</TableHead>
                        <TableHead>Yopilgan sana</TableHead>
                        <TableHead className="text-right">Komissiya ($)</TableHead>
                        <TableHead className="text-right">Bonus (so'm)</TableHead>
                        <TableHead className="text-right">Holat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.items.map((it) => {
                        const isApproved = approvedSet.has(it.id);
                        return (
                          <TableRow key={it.id}>
                            <TableCell className="font-medium">{it.client}</TableCell>
                            <TableCell>{it.contractNo ?? "—"}</TableCell>
                            <TableCell>{it.completedAt}</TableCell>
                            <TableCell className="text-right">${fmt(Math.round(it.commissionUsd))}</TableCell>
                            <TableCell className="text-right font-semibold">{fmt(it.bonus)}</TableCell>
                            <TableCell className="text-right">
                              {isApproved ? (
                                <div className="inline-flex items-center gap-2">
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Tasdiqlangan
                                  </Badge>
                                  {isAdmin && (
                                    <Button size="sm" variant="ghost" onClick={() => unapprove.mutate(it.id)}>
                                      Bekor
                                    </Button>
                                  )}
                                </div>
                              ) : isAdmin ? (
                                <Button
                                  size="sm"
                                  onClick={() => approve.mutate({
                                    contract_id: it.id,
                                    manager_name: g.name,
                                    year: Number(year),
                                    month: Number(month),
                                    bonus: it.bonus,
                                  })}
                                >
                                  KPI tasdiqlash
                                </Button>
                              ) : (
                                <Badge variant="outline">Kutilmoqda</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function RateEditor({ initial, onSave }: { initial: number; onSave: (v: number) => void }) {
  const [val, setVal] = useState<string>(String(initial));
  return (
    <div className="flex gap-2">
      <Input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-8 w-28"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={Number(val) === initial || !val}
        onClick={() => onSave(Number(val))}
      >
        Saqlash
      </Button>
    </div>
  );
}


function KpiPage() {
  const { t } = useT();
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:ml-56 p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4 md:mb-6 pl-10 md:pl-0">
          <Target className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          <h1 className="text-base md:text-xl font-bold">{t("nav.kpi")}</h1>
        </div>

        <Tabs defaultValue="call-centre" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="call-centre" className="gap-2">
              <PhoneCall className="h-4 w-4" />
              <span className="hidden sm:inline">Call-centre</span>
              <span className="sm:hidden">Call</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>Sales</span>
            </TabsTrigger>
            <TabsTrigger value="back-office" className="gap-2">
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Back office</span>
              <span className="sm:hidden">Back</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="call-centre" className="mt-4"><CallCentreKpi /></TabsContent>
          <TabsContent value="sales" className="mt-4"><SalesKpi /></TabsContent>
          <TabsContent value="back-office" className="mt-4">
            <SectionPlaceholder title="Back office KPI" icon={Briefcase} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
