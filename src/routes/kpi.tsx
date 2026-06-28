import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Target, PhoneCall, TrendingUp, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT, localeOf, getMonthNames } from "@/lib/i18n";
import { useUsdRates } from "@/lib/usd-rates";

export const Route = createFileRoute("/kpi")({
  component: KpiPage,
  head: () => ({
    meta: [
      { title: "KPI — GoForVisa" },
      { name: "description", content: "Ishchilar KPI ko'rsatkichlari" },
    ],
  }),
});

// Call-centre tier ladder. Brackets by signed-contract count.
const KPI_TIERS: { min: number; max: number; base: number; kpi: number }[] = [
  { min: 1, max: 5, base: 1_000_000, kpi: 0 },
  { min: 6, max: 10, base: 2_000_000, kpi: 5 },
  { min: 11, max: 15, base: 2_500_000, kpi: 10 },
  { min: 16, max: 20, base: 3_000_000, kpi: 15 },
  { min: 21, max: 25, base: 3_500_000, kpi: 20 },
  { min: 26, max: Infinity, base: 4_000_000, kpi: 25 },
];

function tierFor(count: number) {
  if (count <= 0) return { min: 0, max: 0, base: 0, kpi: 0 };
  return KPI_TIERS.find((t) => count >= t.min && count <= t.max) ?? KPI_TIERS[0];
}

// Sales: 50,000 so'm per $100 of commission → 500 so'm per $1.
const SALES_RATE_PER_USD = 500;

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
      const tier = tierFor(count);
      const bonus = Math.round((tier.base * tier.kpi) / 100);
      const total = tier.base + bonus;
      return { name, count, base: tier.base, kpi: tier.kpi, bonus, total };
    });
    list.sort((a, b) => b.count - a.count);
    return list;
  }, [contracts]);

  const fmt = (n: number) => n.toLocaleString(localeOf(lang));

  return (
    <div className="space-y-4">
      <PeriodPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">KPI Jadvali</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sotuv soni</TableHead>
                  <TableHead>Asosiy oylik</TableHead>
                  <TableHead>KPI %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {KPI_TIERS.map((t) => (
                  <TableRow key={t.min}>
                    <TableCell>{t.max === Infinity ? `${t.min}+` : `${t.min}–${t.max}`}</TableCell>
                    <TableCell>{fmt(t.base)} so'm</TableCell>
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
  const { getRate } = useUsdRates();

  const { data: contracts } = useQuery({
    queryKey: ["kpi-sales-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, sales_manager, price_usd, commission, visa_result");
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

  const rows = useMemo(() => {
    if (!contracts || !payments) return [];
    const yNum = Number(year);
    const mNum = Number(month);
    const byContract = new Map<string, any[]>();
    for (const p of payments as any[]) {
      const arr = byContract.get(p.contract_id) ?? [];
      arr.push(p);
      byContract.set(p.contract_id, arr);
    }

    const byManager = new Map<string, { count: number; commissionUsd: number }>();
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
      const cur = byManager.get(name) ?? { count: 0, commissionUsd: 0 };
      cur.count += 1;
      cur.commissionUsd += commissionUsd;
      byManager.set(name, cur);
    }

    return Array.from(byManager.entries())
      .map(([name, v]) => ({
        name,
        count: v.count,
        commissionUsd: v.commissionUsd,
        bonus: Math.round(v.commissionUsd * SALES_RATE_PER_USD),
      }))
      .sort((a, b) => b.bonus - a.bonus);
  }, [contracts, payments, year, month, getRate]);

  const fmt = (n: number) => n.toLocaleString(localeOf(lang));

  return (
    <div className="space-y-4">
      <PeriodPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Formula</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Har bir to'liq to'langan shartnoma uchun komissiyaning <b className="text-foreground">har $100</b> i = <b className="text-foreground">50 000 so'm</b> bonus.
          Bonus shartnoma 100% to'lab bo'lingan oyda hisoblanadi.
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Sales menejerlar bonusi</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales manager</TableHead>
                  <TableHead className="text-right">To'liq to'langan shartnoma</TableHead>
                  <TableHead className="text-right">Komissiya ($)</TableHead>
                  <TableHead className="text-right">Bonus (so'm)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Bu oyda to'liq to'lov amalga oshmagan</TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">${fmt(Math.round(r.commissionUsd))}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{fmt(r.bonus)} so'm</TableCell>
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
