import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { useT, localeOf } from "@/lib/i18n";
import { getContracts, type Contract } from "@/lib/contracts.functions";
import { RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/shartnomalar")({
  component: ShartnomalarPage,
});

function ShartnomalarPage() {
  const { user, loading: authLoading } = useAuth();
  const { can, loading: permLoading } = useWidgetPermissions();
  const navigate = Route.useNavigate();
  const { t, lang } = useT();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!permLoading && user && !can("contracts_section")) {
      navigate({ to: "/" });
    }
  }, [permLoading, user, can, navigate]);

  const fetchContracts = useServerFn(getContracts);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => fetchContracts(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const [search, setSearch] = useState("");
  const all = data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.contractNo.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.salesManager.toLowerCase().includes(q) ||
        c.backOfficeManager.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.visaResult.toLowerCase().includes(q)
      );
    });
  }, [all, search]);

  const fmt = (n: number) =>
    n ? n.toLocaleString(localeOf(lang), { maximumFractionDigits: 2 }) : "—";

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:pl-56">
        <div className="container mx-auto px-4 py-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">{t("nav.contracts")}</h1>
              <p className="text-sm text-muted-foreground">
                {all.length} {t("common.records")}
                {isFetching ? ` · ${t("common.updating")}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("dash.search.placeholder")}
                  className="pl-8 w-64"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("nav.contracts")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {t("common.loading")}
                </div>
              ) : error ? (
                <div className="p-6 text-sm text-destructive">
                  {t("common.error")}: {(error as Error).message}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {t("common.notFound")}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>{t("common.year")}</TableHead>
                        <TableHead>{t("common.month")}</TableHead>
                        <TableHead>Ism</TableHead>
                        <TableHead>Shartnoma №</TableHead>
                        <TableHead>Sana</TableHead>
                        <TableHead className="text-right">Narx (UZS)</TableHead>
                        <TableHead className="text-right">Narx (USD)</TableHead>
                        <TableHead className="text-right">Doc (USD)</TableHead>
                        <TableHead className="text-right">Komissiya</TableHead>
                        <TableHead>To'lov</TableHead>
                        <TableHead className="text-right">Odam</TableHead>
                        <TableHead>Izoh</TableHead>
                        <TableHead>Turi</TableHead>
                        <TableHead>Telefon</TableHead>
                        <TableHead>Call centre</TableHead>
                        <TableHead>Sotuv menejer</TableHead>
                        <TableHead>Back office</TableHead>
                        <TableHead>Kompaniya</TableHead>
                        <TableHead>Visa natijasi</TableHead>
                        <TableHead className="text-right">KPI sotuv</TableHead>
                        <TableHead className="text-right">KPI BO</TableHead>
                        <TableHead className="text-right">Jami</TableHead>
                        <TableHead className="text-right">Visa fee</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c: Contract, i: number) => (
                        <TableRow key={`${c.contractNo}-${i}`}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>{c.year}</TableCell>
                          <TableCell>{c.month}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {c.name}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{c.contractNo}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.contractDate}</TableCell>
                          <TableCell className="text-right">{fmt(c.priceUzs)}</TableCell>
                          <TableCell className="text-right">{fmt(c.priceUsd)}</TableCell>
                          <TableCell className="text-right">{fmt(c.docsUsd)}</TableCell>
                          <TableCell className="text-right">{fmt(c.commission)}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.payment || "—"}</TableCell>
                          <TableCell className="text-right">{c.people || "—"}</TableCell>
                          <TableCell
                            className="max-w-[200px] truncate"
                            title={c.note}
                          >
                            {c.note || "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{c.type || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.phone || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.callCentre || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.salesManager || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.backOfficeManager || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.company || "—"}</TableCell>
                          <TableCell>
                            {c.visaResult ? (
                              <Badge variant="outline">{c.visaResult}</Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">{fmt(c.kpiSales)}</TableCell>
                          <TableCell className="text-right">{fmt(c.kpiBackOffice)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(c.total)}</TableCell>
                          <TableCell className="text-right">{fmt(c.visaFee)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
