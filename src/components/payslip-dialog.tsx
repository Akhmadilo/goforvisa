import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { exportPayslipPdf } from "@/lib/payslip-pdf";
import { getMonthNames, localeOf, useT } from "@/lib/i18n";
import { toast } from "sonner";

export interface PayslipTarget {
  id: string;
  employee_name: string;
  year: number;
  month: number;
  fixed_amount: number;
  kpi_amount: number;
  penalty_amount: number;
  advance: number;
  gross: number;
  total: number;
  note: string | null;
}

// Call-centre bosqichlari DB'dan olinadi (call_centre_tiers) — KPI bo'limida tahrirlanadi.
import { fetchCcTiers, ccBaseFor, ccKpiPctFor } from "@/lib/cc-tiers";


interface Detail {
  fines: { date: string; amount: number; reason: string; note: string | null; minutes: number }[];
  advances: { date: string; amount: number; purpose: string; status: string }[];
  payments: { date: string; amount: number; kind: string; note: string | null }[];
  kpiApprovals: { client: string; bonus: number; role: string; contractNo: string | null }[];
  extras: { amount: number; description: string; date: string }[];
  ccCount: number;
  ccBase: number;
  ccPct: number;
  ccBonus: number;
}

async function fetchDetail(target: PayslipTarget): Promise<Detail> {
  const name = target.employee_name.trim();
  const { year, month } = target;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const end = `${endDateStr}T23:59:59`;

  const { data: emp } = await supabase
    .from("employees").select("id").eq("full_name", name).maybeSingle();

  const [finesRes, advRes, payRes, ccRes, kpiRes, extraRes] = await Promise.all([
    emp?.id
      ? supabase.from("fines")
          .select("date, amount_uzs, reason, note, minutes_late")
          .eq("employee_id", emp.id).gte("date", start).lte("date", endDateStr).order("date")
      : Promise.resolve({ data: [] as any[] }),
    emp?.id
      ? supabase.from("advance_requests")
          .select("amount_uzs, purpose, status, created_at, paid_at, deducted_in_salary_id, salaries:deducted_in_salary_id(year, month)")
          .eq("employee_id", emp.id).in("status", ["approved", "paid"])
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("salary_payments")
      .select("paid_at, amount, kind, note").eq("salary_id", target.id).order("paid_at"),
    supabase.from("contracts")
      .select("id, client_name, visa_result")
      .eq("call_centre", name).eq("year", String(year)).eq("month", String(month)),
    (supabase as any).from("sales_kpi_approvals")
      .select("bonus_uzs, role, contract_id, contracts(client_name, contract_no)")
      .eq("manager_name", name).eq("approved_year", year)
      .eq("approved_month", month).eq("status", "approved"),
    (supabase as any).from("extra_bonuses")
      .select("amount_uzs, description, created_at")
      .eq("employee_name", name).eq("year", year).eq("month", month)
      .order("created_at"),
  ]);

  const ccCount = (ccRes.data ?? []).filter(
    (c: any) => c.visa_result !== "Bekor qilindi" && c.visa_result !== "To'xtatildi",
  ).length;
  let ccBase = 0, ccPct = 0, ccBonus = 0;
  if (ccCount > 0) {
    const tiers = await fetchCcTiers().catch(() => []);
    ccBase = ccBaseFor(tiers, ccCount);
    ccPct = ccKpiPctFor(tiers, ccCount);
    ccBonus = Math.round((ccBase * ccPct) / 100);
  }


  return {
    fines: (finesRes.data ?? []).map((f: any) => ({
      date: f.date, amount: Number(f.amount_uzs || 0), reason: f.reason ?? "—",
      note: f.note ?? null, minutes: Number(f.minutes_late || 0),
    })),
    advances: (advRes.data ?? [])
      .filter((a: any) => {
        const link = Array.isArray(a.salaries) ? a.salaries[0] : a.salaries;
        if (link?.year != null && link?.month != null) {
          return Number(link.year) === year && Number(link.month) === month;
        }
        const ref = a.paid_at || a.created_at;
        return ref && ref >= start && ref <= end;
      })
      .map((a: any) => ({
        date: String(a.paid_at || a.created_at).slice(0, 10),
        amount: Number(a.amount_uzs || 0), purpose: a.purpose ?? "—", status: a.status,
      })),
    payments: (payRes.data ?? []).map((p: any) => ({
      date: p.paid_at, amount: Number(p.amount || 0), kind: p.kind, note: p.note ?? null,
    })),
    kpiApprovals: (kpiRes.data ?? []).map((k: any) => ({
      client: k.contracts?.client_name ?? "—",
      contractNo: k.contracts?.contract_no ?? null,
      bonus: Number(k.bonus_uzs || 0),
      role: k.role ?? "sales",
    })),
    extras: ((extraRes as any).data ?? []).map((e: any) => ({
      amount: Number(e.amount_uzs || 0),
      description: e.description ?? "—",
      date: String(e.created_at ?? "").slice(0, 10),
    })),
    ccCount, ccBase, ccPct, ccBonus,
  };
}

export function PayslipDialog({
  target, onClose,
}: { target: PayslipTarget | null; onClose: () => void }) {
  const { t, lang } = useT();
  const monthNames = getMonthNames(lang);
  const contentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["payslip", target?.id],
    queryFn: () => fetchDetail(target!),
    enabled: !!target,
    staleTime: 60_000,
  });

  const nf = (n: number) => new Intl.NumberFormat(localeOf(lang)).format(Math.round(n)) + " so'm";

  if (!target) return null;
  const periodLabel = `${monthNames[target.month - 1]} ${target.year}`;
  const paidTotal = (data?.payments ?? []).reduce((a, p) => a + p.amount, 0);

  const onExport = async () => {
    setExporting(true);
    try {
      const d = data;
      const tables = [] as any[];

      if (d && (d.ccCount > 0 || d.kpiApprovals.length > 0 || d.extras.length > 0)) {
        const body: string[][] = [];
        if (d.ccCount > 0) {
          body.push([t("pay.ccKpi"), t("ps.contractCount", { n: String(d.ccCount) }), `${t("ps.tier")}: ${nf(d.ccBase)} × ${d.ccPct}%`, nf(d.ccBonus)]);
        }
        d.kpiApprovals.forEach((k) =>
          body.push([t("pay.pdf.bonusSource", { role: k.role }), k.client, k.contractNo ?? "—", nf(k.bonus)]),
        );
        d.extras.forEach((e) =>
          body.push([t("ps.extraBonus"), e.description, e.date || "—", nf(e.amount)]),
        );
        const extrasTotal = d.extras.reduce((a, e) => a + e.amount, 0);
        body.push([
          t("pay.pdf.totalBonus"), "", "",
          nf(d.ccBonus + d.kpiApprovals.reduce((a, k) => a + k.bonus, 0) + extrasTotal),
        ]);
        tables.push({
          title: t("pay.pdf.bonusBreakdown"),
          head: [t("pay.pdf.source"), t("pay.pdf.clientVolumeReason"), t("pay.col.note"), t("pay.col.amount")],
          body,
          align: ["left", "left", "left", "right"],
        });
      }

      if (d && d.fines.length) {
        tables.push({
          title: t("pay.pdf.fineDetails"),
          head: [t("pay.col.date"), t("pay.pdf.reason"), t("pay.col.lateness"), t("pay.col.note"), t("pay.col.amount")],
          body: [
            ...d.fines.map((f) => [f.date, f.reason, f.minutes > 0 ? `${f.minutes} ${t("pay.minutesShort")}` : "—", f.note ?? "—", `-${nf(f.amount)}`]),
            [t("pay.totalFines"), "", "", "", `-${nf(d.fines.reduce((a, f) => a + f.amount, 0))}`],
          ],
          align: ["left", "left", "left", "left", "right"],
        });
      }

      if (d && d.advances.length) {
        tables.push({
          title: t("pay.pdf.advances"),
          head: [t("pay.col.date"), t("pay.pdf.purpose"), t("common.status"), t("pay.col.amount")],
          body: [
            ...d.advances.map((a) => [a.date, a.purpose, a.status, nf(a.amount)]),
            [t("pay.advanceTaken"), "", "", nf(d.advances.reduce((a, x) => a + x.amount, 0))],
          ],
          align: ["left", "left", "left", "right"],
        });
      }

      if (d && d.payments.length) {
        tables.push({
          title: t("pay.pdf.payments"),
          head: [t("pay.col.date"), t("common.type"), t("pay.col.note"), t("pay.col.amount")],
          body: [
            ...d.payments.map((p) => [p.date, p.kind === "advance" ? t("pay.kindAdvance") : t("pay.kindPayment"), p.note ?? "—", nf(p.amount)]),
            [t("pay.totalPaid"), "", "", nf(paidTotal)],
            [t("pay.remaining"), "", "", nf(Math.max(0, target.gross - paidTotal))],
          ],
          align: ["left", "left", "left", "right"],
        });
      }

      await exportPayslipPdf({
        filename: `${target.employee_name
          .trim()
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join("_")}_${
          ["January","February","March","April","May","June","July","August","September","October","November","December"][
            Math.min(11, Math.max(0, Number(target.month) - 1))
          ]
        }_Salary_${target.year}.pdf`,
        employee: target.employee_name,
        period: periodLabel,
        summary: [
          { label: t("pay.fixedSalary"), value: nf(Number(target.fixed_amount)) },
          { label: t("pay.bonusKpi"), value: `+ ${nf(Number(target.kpi_amount))}`, tone: "primary" },
          { label: t("pay.fines"), value: `- ${nf(Number(target.penalty_amount))}`, tone: "danger" },
          { label: t("pay.grossSalary"), value: nf(target.gross), strong: true },
          { label: t("pay.advanceTaken"), value: target.advance > 0 ? `- ${nf(target.advance)}` : "—", tone: "muted" },
          { label: t("pay.finalAmount"), value: nf(target.total), strong: true, tone: "primary" },
        ],
        notes: [
          t("pay.formula"),
        ],
        tables,
        footNote: target.note,
      });
    } catch (e: any) {
      toast.error(e?.message ?? t("pay.pdfNotCreated"));
    } finally {
      setExporting(false);
    }
  };


  const Row = ({ label, value, tone }: { label: string; value: string; tone?: "primary" | "destructive" | "muted" }) => (
    <div className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={
        tone === "primary" ? "font-semibold text-primary"
        : tone === "destructive" ? "font-semibold text-destructive"
        : tone === "muted" ? "text-muted-foreground" : "font-semibold"
      }>{value}</span>
    </div>
  );

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-[min(96vw,900px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> {t("pay.title")}
          </DialogTitle>
          <DialogDescription>
            {t("pay.description", { name: target.employee_name, period: periodLabel })}
          </DialogDescription>
        </DialogHeader>

        <div ref={contentRef} className="space-y-4">
          {/* Umumiy */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-sm font-semibold">{t("pay.section1.title")}</div>
            <Row label={t("pay.fixedSalary")} value={nf(Number(target.fixed_amount))} />
            <Row label={t("pay.bonusKpi")} value={`+ ${nf(Number(target.kpi_amount))}`} tone="primary" />
            <Row label={t("pay.fines")} value={`− ${nf(Number(target.penalty_amount))}`} tone="destructive" />
            <Row label={t("pay.grossSalary")} value={nf(target.gross)} />
            <Row label={t("pay.advanceTaken")} value={target.advance > 0 ? `− ${nf(target.advance)}` : "—"} tone="muted" />
            <Row label={t("pay.finalAmount")} value={nf(target.total)} tone="primary" />
            <div className="mt-2 rounded bg-muted p-2 text-xs text-muted-foreground">
              {t("pay.formula")}
            </div>
          </section>

          {/* Bonus izohi */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-sm font-semibold">{t("pay.section2.title")}</div>
            {isLoading ? (
              <div className="py-4 text-sm text-muted-foreground">{t("pay.loading")}</div>
            ) : (
              <div className="space-y-3">
                {data && data.ccCount > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">{t("pay.ccKpi")}</div>
                    <Row label={t("pay.ccContractsCount")} value={`${data.ccCount} ${t("wr.newSuffix") === "yangi" ? "ta" : ""}`.trim() || `${data.ccCount}`} />
                    <Row label={t("pay.ccTierSalary")} value={nf(data.ccBase)} />
                    <Row label={t("pay.ccTierPct")} value={`${data.ccPct}%`} />
                    <Row label={t("pay.ccBonusFormula", { base: nf(data.ccBase), pct: data.ccPct })} value={nf(data.ccBonus)} tone="primary" />
                  </div>
                )}

                {data && data.kpiApprovals.length > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      {t("pay.approvedContractBonuses")}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                           <th className="py-1">{t("pay.col.client")}</th>
                           <th className="py-1">{t("pay.col.contract")}</th>
                           <th className="py-1">{t("pay.col.role")}</th>
                           <th className="py-1 text-right">{t("pay.col.bonus")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.kpiApprovals.map((k, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1">{k.client}</td>
                            <td className="py-1 text-muted-foreground">{k.contractNo ?? "—"}</td>
                            <td className="py-1 text-muted-foreground">{k.role}</td>
                            <td className="py-1 text-right font-medium text-primary">{nf(k.bonus)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-border">
                           <td className="py-1 font-semibold" colSpan={3}>{t("pay.total")}</td>
                          <td className="py-1 text-right font-semibold text-primary">
                            {nf(data.kpiApprovals.reduce((a, k) => a + k.bonus, 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {data && data.extras.length > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                       {t("pay.extraBonus")}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                           <th className="py-1">{t("pay.col.date")}</th>
                           <th className="py-1">{t("pay.col.reasonNote")}</th>
                           <th className="py-1 text-right">{t("pay.col.amount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.extras.map((e, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1 text-muted-foreground">{e.date || "—"}</td>
                            <td className="py-1">{e.description}</td>
                            <td className="py-1 text-right font-medium text-primary">{nf(e.amount)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-border">
                           <td className="py-1 font-semibold" colSpan={2}>{t("pay.totalExtraBonus")}</td>
                          <td className="py-1 text-right font-semibold text-primary">
                            {nf(data.extras.reduce((a, e) => a + e.amount, 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {data && data.ccCount === 0 && data.kpiApprovals.length === 0 && data.extras.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                     {t("pay.noAutoBonusSource")}
                    {Number(target.kpi_amount) > 0
                       ? t("pay.manualBonusHint")
                       : t("pay.noBonusCalculated")}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Jarimalar */}
          <section className="rounded-lg border border-border bg-card p-4">
             <div className="mb-2 text-sm font-semibold">{t("pay.section3.title")}</div>
            {(data?.fines.length ?? 0) === 0 ? (
               <div className="text-sm text-muted-foreground">{t("pay.noFines")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                     <th className="py-1">{t("pay.col.date")}</th>
                     <th className="py-1">{t("pay.pdf.reason")}</th>
                     <th className="py-1">{t("pay.col.lateness")}</th>
                     <th className="py-1">{t("pay.col.note")}</th>
                     <th className="py-1 text-right">{t("pay.col.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.fines.map((f, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1">{f.date}</td>
                      <td className="py-1">{f.reason}</td>
                       <td className="py-1 text-muted-foreground">{f.minutes > 0 ? `${f.minutes} ${t("pay.minutesShort")}` : "—"}</td>
                      <td className="py-1 text-muted-foreground">{f.note ?? "—"}</td>
                      <td className="py-1 text-right text-destructive">−{nf(f.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                     <td className="py-1 font-semibold" colSpan={4}>{t("pay.totalFines")}</td>
                    <td className="py-1 text-right font-semibold text-destructive">
                      −{nf(data!.fines.reduce((a, f) => a + f.amount, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          {/* Avans va to'lovlar */}
          <section className="rounded-lg border border-border bg-card p-4">
             <div className="mb-2 text-sm font-semibold">{t("pay.section4.title")}</div>
            <div className="mb-3">
               <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("pay.advancesTitle")}</div>
              {(data?.advances.length ?? 0) === 0 ? (
                 <div className="text-sm text-muted-foreground">{t("pay.noAdvance")}</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data!.advances.map((a, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1">{a.date}</td>
                        <td className="py-1 text-muted-foreground">{a.purpose}</td>
                        <td className="py-1 text-muted-foreground">{a.status}</td>
                        <td className="py-1 text-right">{nf(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
               <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("pay.paymentsTitle")}</div>
              {(data?.payments.length ?? 0) === 0 ? (
                 <div className="text-sm text-muted-foreground">{t("pay.noPayments")}</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data!.payments.map((p, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1">{p.date}</td>
                         <td className="py-1 text-muted-foreground">{p.kind === "advance" ? t("pay.kindAdvance") : t("pay.kindPayment")}</td>
                        <td className="py-1 text-muted-foreground">{p.note ?? "—"}</td>
                        <td className="py-1 text-right">{nf(p.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border">
                       <td className="py-1 font-semibold" colSpan={3}>{t("pay.totalPaid")}</td>
                      <td className="py-1 text-right font-semibold">{nf(paidTotal)}</td>
                    </tr>
                    <tr className="border-t border-border">
                       <td className="py-1 font-semibold" colSpan={3}>{t("pay.remaining")}</td>
                      <td className="py-1 text-right font-semibold text-primary">
                        {nf(Math.max(0, target.gross - paidTotal))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            {target.note && (
              <div className="mt-3 rounded bg-muted p-2 text-xs text-muted-foreground">
                 {t("pay.noteLabel")} {target.note}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
           <Button variant="outline" onClick={onClose}>{t("pay.close")}</Button>
          <Button onClick={onExport} disabled={exporting || isLoading}>
            {exporting ? <RefreshCw className="animate-spin" /> : <FileText />}
             {exporting ? t("pay.exporting") : t("pay.exportPdf")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
