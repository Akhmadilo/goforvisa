import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";

import { useMemo, useState, useEffect } from "react";
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


// Call-centre: base salary and KPI % ladders now live in the DB (call_centre_tiers).
export { ccBaseFor, ccKpiPctFor } from "@/lib/cc-tiers";


/** Trim + collapse inner whitespace so "Ali  Vali " and "Ali Vali" group together. */
/** Special row in sales_kpi_rates holding the fallback rate for a role. */
export const DEFAULT_RATE_KEY = "__default__";

export function normalizeName(v: string | null | undefined) {
  return (v ?? "").replace(/\s+/g, " ").trim();
}


/** Cancelled/stopped contracts never earn KPI. Robust to case + apostrophe variants. */
export function isCancelledResult(v: string | null | undefined) {
  const s = normalizeName(v).toLowerCase().replace(/[’`ʻ']/g, "'");
  if (!s) return false;
  return s.includes("bekor") || s.includes("to'xtat") || s.includes("toxtat") || s.includes("rad etil");
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

function EmployeeFilter({
  value, onChange, names,
}: { value: string; onChange: (v: string) => void; names: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Xodim</CardTitle></CardHeader>
      <CardContent>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Barchasi" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Barchasi</SelectItem>
            {names.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
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
  const [employee, setEmployee] = useState<string>("__all__");

  const { data: contracts } = useQuery({
    queryKey: ["kpi-cc-contracts", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("call_centre, visa_result")
        .eq("year", year)
        .eq("month", month)
        .not("call_centre", "is", null)
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: operators } = useQuery({
    queryKey: ["kpi-cc-operators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operators")
        .select("name, is_active")
        .eq("kind", "call_centre");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const allRows = useMemo(() => {
    // key = lowercased name so casing/spacing typos don't split one operator in two.
    const counts = new Map<string, { label: string; count: number }>();
    const put = (rawName: string, inc: number) => {
      const label = normalizeName(rawName);
      if (!label) return;
      const key = label.toLowerCase();
      const cur = counts.get(key) ?? { label, count: 0 };
      cur.count += inc;
      counts.set(key, cur);
    };

    (operators ?? []).forEach((o: { name: string; is_active: boolean }) => {
      if (o.is_active) put(o.name, 0);
    });

    // Call-centre sotuv soni: operator shartnomani qilgan, keyin mijoz bekor qilsa ham
    // operatorning oylik hisobiga kiradi — shuning uchun bekor qilinganlar chiqarilmaydi.
    (contracts ?? []).forEach((c: { call_centre: string | null; visa_result: string | null }) => {
      put(c.call_centre ?? "", 1);
    });

    return Array.from(counts.values())
      .map(({ label, count }) => {
        const base = ccBaseFor(tiers, count);
        const kpi = ccKpiPctFor(tiers, count);
        const bonus = Math.round((base * kpi) / 100);
        return { name: label, count, base, kpi, bonus, total: base + bonus };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [contracts, operators, tiers]);

  const rows = useMemo(
    () => (employee === "__all__" ? allRows : allRows.filter((r) => r.name === employee)),
    [allRows, employee],
  );
  const names = useMemo(() => [...allRows].sort((a, b) => a.name.localeCompare(b.name)).map((r) => r.name), [allRows]);


  const fmt = (n: number) => n.toLocaleString(localeOf(lang));

  return (
    <div className="space-y-4">
      <PeriodPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />
      <EmployeeFilter value={employee} onChange={setEmployee} names={names} />

      <CcTierEditor />



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

type CommissionRole = "sales" | "back_office";

function CommissionKpi({
  role,
  managerField,
  managerLabel,
  formulaHint,
}: {
  role: CommissionRole;
  managerField: "sales_manager" | "back_office_manager";
  managerLabel: string;
  formulaHint: string;
}) {
  const { lang } = useT();
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [employee, setEmployee] = useState<string>("__all__");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { getRate } = useUsdRates();
  const isAdmin = useIsAdmin();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fmt = (n: number) => n.toLocaleString(localeOf(lang));

  const { data: contracts } = useQuery({
    queryKey: ["kpi-commission-contracts", managerField],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select(`id, client_name, contract_no, ${managerField}, price_usd, commission, visa_result`)
        .not(managerField, "is", null)
        .gt("price_usd", 0)
        .gt("commission", 0)
        .limit(20000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });

  // One shared payments cache for both KPI tabs — avoids a huge `in(...)` URL
  // and a second identical round-trip when switching tabs.
  const { data: payments } = useQuery({
    queryKey: ["kpi-contract-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments")
        .select("contract_id, amount, currency, paid_at")
        .order("paid_at", { ascending: true })
        .limit(50000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });


  const { data: rates } = useQuery({
    queryKey: ["sales_kpi_rates", role],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_kpi_rates")
        .select("manager_name, rate_per_usd")
        .eq("role", role);
      if (error) throw error;
      return (data ?? []) as { manager_name: string; rate_per_usd: number }[];
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const { data: approvals } = useQuery({
    queryKey: ["sales_kpi_approvals", role],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_kpi_approvals")
        .select("contract_id, approved_year, approved_month, bonus_uzs, status")
        .eq("role", role);
      if (error) throw error;
      return (data ?? []) as { contract_id: string; approved_year: number; approved_month: number; bonus_uzs: number; status: "approved" | "rejected" }[];
    },
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  const defaultRate = useMemo(() => {
    const r = (rates ?? []).find((x) => x.manager_name === DEFAULT_RATE_KEY);
    return r ? Number(r.rate_per_usd) : 500;
  }, [rates]);

  const rateFor = (name: string): number => {
    const key = normalizeName(name).toLowerCase();
    const r = (rates ?? []).find((x) => normalizeName(x.manager_name).toLowerCase() === key);
    return r ? Number(r.rate_per_usd) : defaultRate;
  };



  const setRate = useMutation({
    mutationFn: async ({ name, rate }: { name: string; rate: number }) => {
      const { error } = await (supabase as any)
        .from("sales_kpi_rates")
        .upsert({ manager_name: name, rate_per_usd: rate, role }, { onConflict: "role,manager_name" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_rates", role] });
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
          role,
        },
        { onConflict: "role,contract_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_approvals", role] });
      toast.success(vars.status === "approved" ? "KPI tasdiqlandi" : "KPI berilmaydi");
    },
    onError: (e: any) => toast.error(e.message ?? "Xato"),
  });

  const clearStatus = useMutation({
    mutationFn: async (contract_id: string) => {
      const { error } = await (supabase as any)
        .from("sales_kpi_approvals")
        .delete()
        .eq("contract_id", contract_id)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_approvals", role] });
      toast.success("Bekor qilindi");
    },
  });

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
    const groups = new Map<string, { label: string; items: Item[] }>();

    for (const c of contracts as any[]) {
      const name = normalizeName(c[managerField]);
      if (!name) continue;
      if (isCancelledResult(c.visa_result)) continue;
      const price = Number(c.price_usd ?? 0);
      const commissionUsd = Number(c.commission ?? 0);
      if (price <= 0 || commissionUsd <= 0) continue;
      const ps = byContract.get(c.id) ?? [];
      let running = 0;
      let completionDate: string | null = null;
      for (const p of ps) {
        const amt = Number(p.amount ?? 0);
        const ym = (p.paid_at as string).slice(0, 7);
        const rateUzs = getRate(ym);
        const usd = (p.currency ?? "UZS") === "USD" ? amt : rateUzs > 0 ? amt / rateUzs : 0;
        running += usd;
        if (running >= price - 0.01) {
          completionDate = p.paid_at;
          break;
        }
      }
      if (!completionDate) continue;
      // paid_at is a plain date string — parse it without timezone shifts.
      const [cy, cm] = completionDate.slice(0, 10).split("-").map(Number);
      if (cy !== yNum || cm !== mNum) continue;
      const rate = rateFor(name);
      const bonus = Math.round(commissionUsd * rate);
      const key = name.toLowerCase();
      const g = groups.get(key) ?? { label: name, items: [] };
      g.items.push({
        id: c.id,
        client: c.client_name,
        contractNo: c.contract_no,
        commissionUsd,
        bonus,
        completedAt: completionDate,
      });
      groups.set(key, g);
    }

    const approvedSet = new Set((approvals ?? []).filter((a) => a.status === "approved").map((a) => a.contract_id));
    const rejectedSet = new Set((approvals ?? []).filter((a) => a.status === "rejected").map((a) => a.contract_id));
    const list = Array.from(groups.values())
      .map(({ label: name, items }) => {

        const approvedTotal = items.filter((i) => approvedSet.has(i.id)).reduce((s, i) => s + i.bonus, 0);
        const rejectedTotal = items.filter((i) => rejectedSet.has(i.id)).reduce((s, i) => s + i.bonus, 0);
        const pendingTotal = items
          .filter((i) => !approvedSet.has(i.id) && !rejectedSet.has(i.id))
          .reduce((s, i) => s + i.bonus, 0);
        return { name, items, approvedTotal, pendingTotal, rejectedTotal, total: approvedTotal + pendingTotal };
      })
      .sort((a, b) => b.total - a.total);
    return list;
  }, [contracts, payments, year, month, getRate, rates, approvals, managerField]);

  const allNames = useMemo(() => managerGroups.map((g) => g.name), [managerGroups]);
  const filteredGroups = useMemo(
    () => (employee === "__all__" ? managerGroups : managerGroups.filter((g) => g.name === employee)),
    [managerGroups, employee],
  );

  const approvedSet = useMemo(() => new Set((approvals ?? []).filter((a) => a.status === "approved").map((a) => a.contract_id)), [approvals]);
  const rejectedSet = useMemo(() => new Set((approvals ?? []).filter((a) => a.status === "rejected").map((a) => a.contract_id)), [approvals]);
  const approvalByContract = useMemo(() => {
    const m = new Map<string, { year: number; month: number; status: "approved" | "rejected" }>();
    (approvals ?? []).forEach((a) => m.set(a.contract_id, { year: a.approved_year, month: a.approved_month, status: a.status }));
    return m;
  }, [approvals]);
  const navigate = useNavigate();

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
      <EmployeeFilter value={employee} onChange={setEmployee} names={allNames} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Formula</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {formulaHint}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{managerLabel} stavkasi (so'm / $1)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{managerLabel}</TableHead>
                    <TableHead className="w-48">Stavka (so'm/$)</TableHead>
                    <TableHead className="text-right">Ekvivalent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-medium">Standart (barcha xodimlar)</TableCell>
                    <TableCell>
                      <RateEditor
                        initial={defaultRate}
                        onSave={(v) => setRate.mutate({ name: DEFAULT_RATE_KEY, rate: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">{fmt(defaultRate * 100)} so'm / $100</TableCell>
                  </TableRow>
                  {filteredGroups.map((g) => {
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

      {filteredGroups.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Bu oyda to'liq to'lov amalga oshmagan</CardContent></Card>
      ) : filteredGroups.map((g) => {
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
                  {g.rejectedTotal > 0 && <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Berilmaydi: {fmt(g.rejectedTotal)} so'm</Badge>}
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
                        <TableHead>Oylikka qo'shiladi</TableHead>
                        <TableHead className="text-right">Holat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.items.map((it) => (
                        <KpiCommissionRow
                          key={it.id}
                          it={it}
                          managerName={g.name}
                          isAdmin={isAdmin}
                          isApproved={approvedSet.has(it.id)}
                          isRejected={rejectedSet.has(it.id)}
                          approvalInfo={approvalByContract.get(it.id) ?? null}
                          defaultYear={Number(year)}
                          defaultMonth={Number(month)}
                          fmt={fmt}
                          onOpenContract={(id) => navigate({ to: "/shartnomalar", search: { openId: id } })}
                          onSetStatus={(payload) => setStatus.mutate(payload)}
                          onClear={(id) => clearStatus.mutate(id)}
                        />
                      ))}
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
  useEffect(() => setVal(String(initial)), [initial]);

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

type KpiCommissionRowProps = {
  it: { id: string; client: string; contractNo: string | null; commissionUsd: number; bonus: number; completedAt: string };
  managerName: string;
  isAdmin: boolean;
  isApproved: boolean;
  isRejected: boolean;
  approvalInfo: { year: number; month: number; status: "approved" | "rejected" } | null;
  defaultYear: number;
  defaultMonth: number;
  fmt: (n: number) => string;
  onOpenContract: (id: string) => void;
  onSetStatus: (p: { contract_id: string; manager_name: string; year: number; month: number; bonus: number; status: "approved" | "rejected" }) => void;
  onClear: (id: string) => void;
};

function KpiCommissionRow({
  it, managerName, isAdmin, isApproved, isRejected, approvalInfo,
  defaultYear, defaultMonth, fmt, onOpenContract, onSetStatus, onClear,
}: KpiCommissionRowProps) {
  const { lang } = useT();
  const months = getMonthNames(lang);
  const now = new Date();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const initYear = approvalInfo?.year ?? defaultYear;
  const initMonth = approvalInfo?.month ?? defaultMonth;
  const [selYear, setSelYear] = useState<number>(initYear);
  const [selMonth, setSelMonth] = useState<number>(initMonth);

  useEffect(() => {
    setSelYear(approvalInfo?.year ?? defaultYear);
    setSelMonth(approvalInfo?.month ?? defaultMonth);
  }, [approvalInfo?.year, approvalInfo?.month, defaultYear, defaultMonth]);

  const periodChanged = approvalInfo
    ? approvalInfo.year !== selYear || approvalInfo.month !== selMonth
    : false;

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell
        className="font-medium text-primary underline-offset-2 hover:underline cursor-pointer"
        onClick={() => onOpenContract(it.id)}
      >
        {it.client}
      </TableCell>
      <TableCell
        className="cursor-pointer"
        onClick={() => onOpenContract(it.id)}
      >
        {it.contractNo ?? "—"}
      </TableCell>
      <TableCell>{it.completedAt}</TableCell>
      <TableCell className="text-right">${fmt(Math.round(it.commissionUsd))}</TableCell>
      <TableCell className="text-right font-semibold">{fmt(it.bonus)}</TableCell>
      <TableCell>
        {isAdmin ? (
          <div className="flex gap-1">
            <Select value={String(selMonth)} onValueChange={(v) => setSelMonth(Number(v))}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(selYear)} onValueChange={(v) => setSelYear(Number(v))}>
              <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            {periodChanged && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSetStatus({
                  contract_id: it.id, manager_name: managerName,
                  year: selYear, month: selMonth, bonus: it.bonus,
                  status: approvalInfo!.status,
                })}
              >
                Saqlash
              </Button>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{months[selMonth - 1]} {selYear}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {isApproved ? (
          <div className="inline-flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Tasdiqlangan
            </Badge>
            {isAdmin && (
              <Button size="sm" variant="ghost" onClick={() => onClear(it.id)}>Bekor</Button>
            )}
          </div>
        ) : isRejected ? (
          <div className="inline-flex items-center gap-2">
            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 gap-1">
              <XCircle className="h-3 w-3" /> Berilmaydi
            </Badge>
            {isAdmin && (
              <Button size="sm" variant="ghost" onClick={() => onClear(it.id)}>Bekor</Button>
            )}
          </div>
        ) : isAdmin ? (
          <div className="inline-flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => onSetStatus({
                contract_id: it.id, manager_name: managerName,
                year: selYear, month: selMonth, bonus: it.bonus, status: "approved",
              })}
            >
              KPI tasdiqlash
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onSetStatus({
                contract_id: it.id, manager_name: managerName,
                year: selYear, month: selMonth, bonus: it.bonus, status: "rejected",
              })}
            >
              Berilmasin
            </Button>
          </div>
        ) : (
          <Badge variant="outline">Kutilmoqda</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}



function VisaBonusKpi() {
  const { lang } = useT();
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [employee, setEmployee] = useState<string>("__all__");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isAdmin = useIsAdmin();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fmt = (n: number) => n.toLocaleString(localeOf(lang));
  const role = "visa_bonus" as const;
  const DEFAULT_RATE = 250;

  const { data: contracts } = useQuery({
    queryKey: ["kpi-visa-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, client_name, contract_no, back_office_manager, commission, visa_result, visa_taken_date" as unknown as "*")
        .eq("visa_result", "Olindi")
        .not("back_office_manager", "is", null)
        .gt("commission", 0);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const { data: rates } = useQuery({
    queryKey: ["sales_kpi_rates", role],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sales_kpi_rates").select("manager_name, rate_per_usd").eq("role", role);
      if (error) throw error;
      return (data ?? []) as { manager_name: string; rate_per_usd: number }[];
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const { data: approvals } = useQuery({
    queryKey: ["sales_kpi_approvals", role],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sales_kpi_approvals").select("contract_id, approved_year, approved_month, bonus_uzs, status").eq("role", role);
      if (error) throw error;
      return (data ?? []) as { contract_id: string; approved_year: number; approved_month: number; bonus_uzs: number; status: "approved" | "rejected" }[];
    },
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  const defaultRate = useMemo(() => {
    const r = (rates ?? []).find((x) => x.manager_name === DEFAULT_RATE_KEY);
    return r ? Number(r.rate_per_usd) : DEFAULT_RATE;
  }, [rates]);

  const rateFor = (name: string): number => {
    const key = normalizeName(name).toLowerCase();
    const r = (rates ?? []).find((x) => normalizeName(x.manager_name).toLowerCase() === key);
    return r ? Number(r.rate_per_usd) : defaultRate;

  };

  const setRate = useMutation({
    mutationFn: async ({ name, rate }: { name: string; rate: number }) => {
      const { error } = await (supabase as any)
        .from("sales_kpi_rates")
        .upsert({ manager_name: name, rate_per_usd: rate, role }, { onConflict: "role,manager_name" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_rates", role] });
      toast.success("Saqlandi");
    },
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
          role,
        },
        { onConflict: "role,contract_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_approvals", role] });
      toast.success(vars.status === "approved" ? "Bonus tasdiqlandi" : "Bonus berilmaydi");
    },
  });

  const clearStatus = useMutation({
    mutationFn: async (contract_id: string) => {
      const { error } = await (supabase as any).from("sales_kpi_approvals").delete().eq("contract_id", contract_id).eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales_kpi_approvals", role] });
      toast.success("Bekor qilindi");
    },
  });

  const managerGroups = useMemo(() => {
    if (!contracts) return [];
    const yNum = Number(year);
    const mNum = Number(month);

    type Item = { id: string; client: string; contractNo: string | null; commissionUsd: number; bonus: number; completedAt: string };
    const groups = new Map<string, { label: string; items: Item[] }>();

    for (const c of contracts as any[]) {
      const name = normalizeName(c.back_office_manager);
      if (!name) continue;
      if (isCancelledResult(c.visa_result)) continue;
      const takenDate: string | null = c.visa_taken_date ?? null;
      if (!takenDate) continue;
      const [ty, tm] = String(takenDate).slice(0, 10).split("-").map(Number);
      if (!ty || !tm) continue;
      if (ty !== yNum || tm !== mNum) continue;
      const commissionUsd = Number(c.commission ?? 0);
      if (commissionUsd <= 0) continue;
      const rate = rateFor(name);
      const bonus = Math.round(commissionUsd * rate);
      const key = name.toLowerCase();
      const g = groups.get(key) ?? { label: name, items: [] };
      g.items.push({ id: c.id, client: c.client_name, contractNo: c.contract_no, commissionUsd, bonus, completedAt: takenDate });
      groups.set(key, g);
    }

    const approvedSet = new Set((approvals ?? []).filter((a) => a.status === "approved").map((a) => a.contract_id));
    const rejectedSet = new Set((approvals ?? []).filter((a) => a.status === "rejected").map((a) => a.contract_id));
    return Array.from(groups.values())
      .map(({ label: name, items }) => {

        const approvedTotal = items.filter((i) => approvedSet.has(i.id)).reduce((s, i) => s + i.bonus, 0);
        const rejectedTotal = items.filter((i) => rejectedSet.has(i.id)).reduce((s, i) => s + i.bonus, 0);
        const pendingTotal = items.filter((i) => !approvedSet.has(i.id) && !rejectedSet.has(i.id)).reduce((s, i) => s + i.bonus, 0);
        return { name, items, approvedTotal, pendingTotal, rejectedTotal, total: approvedTotal + pendingTotal };
      })
      .sort((a, b) => b.total - a.total);
  }, [contracts, year, month, rates, approvals]);

  const allNames = useMemo(() => managerGroups.map((g) => g.name), [managerGroups]);
  const filteredGroups = useMemo(
    () => (employee === "__all__" ? managerGroups : managerGroups.filter((g) => g.name === employee)),
    [managerGroups, employee],
  );
  const approvedSet = useMemo(() => new Set((approvals ?? []).filter((a) => a.status === "approved").map((a) => a.contract_id)), [approvals]);
  const rejectedSet = useMemo(() => new Set((approvals ?? []).filter((a) => a.status === "rejected").map((a) => a.contract_id)), [approvals]);
  const approvalByContract = useMemo(() => {
    const m = new Map<string, { year: number; month: number; status: "approved" | "rejected" }>();
    (approvals ?? []).forEach((a) => m.set(a.contract_id, { year: a.approved_year, month: a.approved_month, status: a.status }));
    return m;
  }, [approvals]);
  const navigate = useNavigate();

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <PeriodPicker year={year} month={month} setYear={setYear} setMonth={setMonth} />
      <EmployeeFilter value={employee} onChange={setEmployee} names={allNames} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Formula</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Viza olingan (Olindi) shartnomalar uchun bonus. Komissiyaning har $1 iga {fmt(defaultRate)} so'm (standart stavka, quyida o'zgartirsa bo'ladi). Davr - viza olingan sana bo'yicha.
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Back office xodim stavkasi (so'm / $1)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Xodim</TableHead><TableHead className="w-48">Stavka (so'm/$)</TableHead><TableHead className="text-right">Ekvivalent</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-medium">Standart (barcha xodimlar)</TableCell>
                    <TableCell><RateEditor initial={defaultRate} onSave={(v) => setRate.mutate({ name: DEFAULT_RATE_KEY, rate: v })} /></TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">{fmt(defaultRate * 100)} so'm / $100</TableCell>
                  </TableRow>
                  {filteredGroups.map((g) => {
                    const cur = rateFor(g.name);
                    return (
                      <TableRow key={g.name}>
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell><RateEditor initial={cur} onSave={(v) => setRate.mutate({ name: g.name, rate: v })} /></TableCell>
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

      {filteredGroups.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Bu oyda viza olingan shartnomalar yo'q</CardContent></Card>
      ) : filteredGroups.map((g) => {
        const isOpen = expanded.has(g.name);
        return (
          <Card key={g.name}>
            <CardHeader className="pb-3 cursor-pointer" onClick={() => toggle(g.name)}>
              <div className="flex flex-wrap items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CardTitle className="text-base">{g.name}</CardTitle>
                <Badge variant="secondary">{g.items.length} viza</Badge>
                <div className="ml-auto flex flex-wrap gap-2 text-sm">
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Tasdiqlangan: {fmt(g.approvedTotal)} so'm</Badge>
                  {g.pendingTotal > 0 && <Badge variant="outline">Kutilmoqda: {fmt(g.pendingTotal)} so'm</Badge>}
                  {g.rejectedTotal > 0 && <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Berilmaydi: {fmt(g.rejectedTotal)} so'm</Badge>}
                  <Badge className="bg-primary text-primary-foreground">Jami: {fmt(g.total)} so'm</Badge>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Mijoz</TableHead><TableHead>Shartnoma №</TableHead><TableHead>Viza olingan</TableHead>
                      <TableHead className="text-right">Komissiya ($)</TableHead><TableHead className="text-right">Bonus (so'm)</TableHead>
                      <TableHead>Oylikka qo'shiladi</TableHead><TableHead className="text-right">Holat</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {g.items.map((it) => (
                        <KpiCommissionRow
                          key={it.id}
                          it={it}
                          managerName={g.name}
                          isAdmin={isAdmin}
                          isApproved={approvedSet.has(it.id)}
                          isRejected={rejectedSet.has(it.id)}
                          approvalInfo={approvalByContract.get(it.id) ?? null}
                          defaultYear={Number(year)}
                          defaultMonth={Number(month)}
                          fmt={fmt}
                          onOpenContract={(id) => navigate({ to: "/shartnomalar", search: { openId: id } })}
                          onSetStatus={(payload) => setStatus.mutate(payload)}
                          onClear={(id) => clearStatus.mutate(id)}
                        />
                      ))}
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

function KpiPage() {
  const { t } = useT();
  const { user, loading: authLoading } = useAuth();
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = useNavigate();
  useEffect(() => {
    if (!authLoading && !permsLoading && user && !can("kpi_section")) {
      navigate({ to: "/" });
    }
  }, [authLoading, permsLoading, user, can, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:ml-56 p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4 md:mb-6 pl-10 md:pl-0">
          <Target className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          <h1 className="text-base md:text-xl font-bold">{t("nav.kpi")}</h1>
        </div>

        <Tabs defaultValue="call-centre" className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-3xl">
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
            <TabsTrigger value="visa-bonus" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden sm:inline">Viza bonusi</span>
              <span className="sm:hidden">Viza</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="call-centre" className="mt-4"><CallCentreKpi /></TabsContent>
          <TabsContent value="sales" className="mt-4">
            <CommissionKpi
              role="sales"
              managerField="sales_manager"
              managerLabel="Sales menejer"
              formulaHint="Har sales menejer uchun komissiyaning har $1 i = belgilangan stavka (default 500 so'm = 50 000/$100). Bonus shartnoma 100% to'lab bo'lingan oyda hisoblanadi."
            />
          </TabsContent>
          <TabsContent value="back-office" className="mt-4">
            <CommissionKpi
              role="back_office"
              managerField="back_office_manager"
              managerLabel="Back office xodim"
              formulaHint="Har back office xodim uchun komissiyaning har $1 i = belgilangan stavka (default 500 so'm = 50 000/$100). Bonus shartnoma 100% to'lab bo'lingan oyda hisoblanadi."
            />
          </TabsContent>
          <TabsContent value="visa-bonus" className="mt-4"><VisaBonusKpi /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
