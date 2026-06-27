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

export const Route = createFileRoute("/kpi")({
  component: KpiPage,
  head: () => ({
    meta: [
      { title: "KPI — GoForVisa" },
      { name: "description", content: "Ishchilar KPI ko'rsatkichlari" },
    ],
  }),
});

// Tier ladder per the spec image.
// Brackets are by number of contracts (sales count) in the period.
// Below 10 contracts → no bonus, minimal base.
const KPI_TIERS: { min: number; max: number; base: number; kpi: number }[] = [
  { min: 0, max: 9, base: 2_000_000, kpi: 0 },
  { min: 10, max: 14, base: 2_000_000, kpi: 5 },
  { min: 15, max: 19, base: 2_500_000, kpi: 10 },
  { min: 20, max: 24, base: 3_000_000, kpi: 15 },
  { min: 25, max: 29, base: 3_500_000, kpi: 20 },
  { min: 30, max: Infinity, base: 4_000_000, kpi: 25 },
];

function tierFor(count: number) {
  return KPI_TIERS.find((t) => count >= t.min && count <= t.max) ?? KPI_TIERS[0];
}

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

function CallCentreKpi() {
  const { lang } = useT();
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));

  const { data: contracts } = useQuery({
    queryKey: ["kpi-contracts", year, month],
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
      // Only count contracts that were actually signed (exclude cancelled/stopped).
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
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 2 + i));
  const months = getMonthNames(lang);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Davr</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">KPI Jadvali</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sotuv (ta gacha)</TableHead>
                  <TableHead>Asosiy oylik</TableHead>
                  <TableHead>KPI %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {KPI_TIERS.filter((t) => t.kpi > 0).map((t) => (
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Call-operatorlar oyligi</CardTitle>
        </CardHeader>
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
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Bu davr uchun ma'lumot yo'q
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right">{fmt(r.base)}</TableCell>
                      <TableCell className="text-right">{r.kpi}%</TableCell>
                      <TableCell className="text-right">{fmt(r.bonus)}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {fmt(r.total)} so'm
                      </TableCell>
                    </TableRow>
                  ))
                )}
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

          <TabsContent value="call-centre" className="mt-4">
            <CallCentreKpi />
          </TabsContent>
          <TabsContent value="sales" className="mt-4">
            <SectionPlaceholder title="Sales KPI" icon={TrendingUp} />
          </TabsContent>
          <TabsContent value="back-office" className="mt-4">
            <SectionPlaceholder title="Back office KPI" icon={Briefcase} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
