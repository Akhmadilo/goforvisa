import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useT, getMonthNames } from "@/lib/i18n";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { countActuals, monthRange, pct } from "@/lib/targets";
import { sendTargetsToTelegram } from "@/lib/bot.functions";

function Cell({ actual, target, edit, value, onChange }: { actual: number; target: number; edit: boolean; value: string; onChange: (v: string) => void }) {
  const p = pct(actual, target);
  return (
    <div className="space-y-1 min-w-[140px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold tabular-nums">{actual}</span>
        <span className="text-muted-foreground">/</span>
        {edit ? (
          <Input type="number" min={0} className="h-8 w-20" value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <span className="tabular-nums">{target || "—"}</span>
        )}
        {p !== null && <span className={p >= 100 ? "text-primary text-xs font-medium" : "text-muted-foreground text-xs"}>{p}%</span>}
      </div>
      {target > 0 && <Progress value={Math.min(100, p ?? 0)} className="h-1.5" />}
    </div>
  );
}

export function EmployeeTargets() {
  const { t, lang } = useT();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const send = useServerFn(sendTargetsToTelegram);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [draft, setDraft] = useState<Record<string, { c: string; d: string }>>({});
  const monthNames = getMonthNames(lang);

  const { data } = useQuery({
    queryKey: ["employee-targets", year, month],
    queryFn: async () => {
      const { data: tenantId } = await supabase.rpc("current_tenant_id");
      const { from, to } = monthRange(year, month);
      const [emps, targets, contracts, tgs] = await Promise.all([
        supabase.from("employees").select("id, full_name, terminated_at").eq("tenant_id", tenantId as string).order("full_name"),
        supabase.from("employee_targets").select("employee_id, contracts_target, docs_target").eq("tenant_id", tenantId as string).eq("year", year).eq("month", month),
        supabase.from("contracts").select("contract_date, sales_manager, back_office_manager").eq("tenant_id", tenantId as string).gte("contract_date", from).lt("contract_date", to),
        supabase.from("employee_telegram").select("employee_id").eq("tenant_id", tenantId as string),
      ]);
      const err = emps.error || targets.error || contracts.error;
      if (err) throw err;
      return { tenantId: tenantId as string, emps: emps.data ?? [], targets: targets.data ?? [], contracts: contracts.data ?? [], linked: new Set((tgs.data ?? []).map((x) => x.employee_id)) };
    },
  });

  useEffect(() => setDraft({}), [year, month, data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const { from } = monthRange(year, month);
    return data.emps
      .filter((e) => !e.terminated_at || e.terminated_at >= from || data.targets.some((x) => x.employee_id === e.id))
      .map((e) => {
        const tg = data.targets.find((x) => x.employee_id === e.id);
        return { ...e, ct: tg?.contracts_target ?? 0, dt: tg?.docs_target ?? 0, ...countActuals(e.full_name, data.contracts, year, month) };
      });
  }, [data, year, month]);

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = rows.map((r) => ({
        tenant_id: data!.tenantId, employee_id: r.id, year, month,
        contracts_target: Math.max(0, Number(draft[r.id]?.c ?? r.ct) || 0),
        docs_target: Math.max(0, Number(draft[r.id]?.d ?? r.dt) || 0),
      }));
      const { error } = await supabase.from("employee_targets").upsert(payload, { onConflict: "tenant_id,employee_id,year,month" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("tgt.saved")); qc.invalidateQueries({ queryKey: ["employee-targets"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const sendM = useMutation({
    mutationFn: (employeeId?: string) => send({ data: { year, month, employeeId } }),
    onSuccess: (r) => toast.success(`${t("tgt.sent")}: ${r.sent}${r.skipped ? ` · ${t("tgt.notLinked")}: ${r.skipped}` : ""}`),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const val = (id: string, k: "c" | "d", base: number) => draft[id]?.[k] ?? String(base || "");
  const setVal = (r: { id: string; ct: number; dt: number }, k: "c" | "d", v: string) =>
    setDraft((d) => ({ ...d, [r.id]: { c: val(r.id, "c", r.ct), d: val(r.id, "d", r.dt), [k]: v } }));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">{t("tgt.title")}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{monthNames.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          {isAdmin && (
            <>
              <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !data}>{t("tgt.save")}</Button>
              <Button variant="outline" onClick={() => sendM.mutate(undefined)} disabled={sendM.isPending || !data} className="gap-2">
                <Send className="h-4 w-4" />{t("tgt.send")}
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("tgt.hint")} {!isAdmin && t("tgt.adminOnly")}</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tgt.employee")}</TableHead>
                <TableHead>{t("tgt.contracts")}</TableHead>
                <TableHead>{t("tgt.docs")}</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.full_name}</div>
                    {!data?.linked.has(r.id) && <div className="text-xs text-muted-foreground">{t("tgt.notLinked")}</div>}
                  </TableCell>
                  <TableCell><Cell actual={r.sold} target={r.ct} edit={isAdmin} value={val(r.id, "c", r.ct)} onChange={(v) => setVal(r, "c", v)} /></TableCell>
                  <TableCell><Cell actual={r.docs} target={r.dt} edit={isAdmin} value={val(r.id, "d", r.dt)} onChange={(v) => setVal(r, "d", v)} /></TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button size="sm" variant="ghost" className="gap-1"
                        disabled={sendM.isPending || !data?.linked.has(r.id) || (!r.ct && !r.dt)}
                        onClick={() => sendM.mutate(r.id)}>
                        <Send className="h-3.5 w-3.5" />{t("tgt.sendOne")}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
