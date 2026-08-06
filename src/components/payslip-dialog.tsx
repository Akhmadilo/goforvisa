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

// Call-centre bosqichlari (kpi.tsx bilan bir xil)
const CC_BASE = [
  { min: 1, max: 4, base: 1_000_000 },
  { min: 5, max: 9, base: 1_500_000 },
  { min: 10, max: 14, base: 2_000_000 },
  { min: 15, max: 19, base: 2_500_000 },
  { min: 20, max: 24, base: 3_000_000 },
  { min: 25, max: 29, base: 3_500_000 },
  { min: 30, max: Infinity, base: 4_000_000 },
];
const CC_KPI = [
  { min: 10, max: 14, kpi: 5 },
  { min: 15, max: 19, kpi: 10 },
  { min: 20, max: 24, kpi: 15 },
  { min: 25, max: 29, kpi: 20 },
  { min: 30, max: Infinity, kpi: 25 },
];

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

  const [finesRes, advRes, payRes, ccRes, kpiRes] = await Promise.all([
    emp?.id
      ? supabase.from("fines")
          .select("date, amount_uzs, reason, note, minutes_late")
          .eq("employee_id", emp.id).gte("date", start).lte("date", endDateStr).order("date")
      : Promise.resolve({ data: [] as any[] }),
    emp?.id
      ? supabase.from("advance_requests")
          .select("amount_uzs, purpose, status, created_at, paid_at")
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
  ]);

  const ccCount = (ccRes.data ?? []).filter(
    (c: any) => c.visa_result !== "Bekor qilindi" && c.visa_result !== "To'xtatildi",
  ).length;
  let ccBase = 0, ccPct = 0, ccBonus = 0;
  if (ccCount > 0) {
    ccBase = (CC_BASE.find((t) => ccCount >= t.min && ccCount <= t.max) ?? CC_BASE[0]).base;
    ccPct = CC_KPI.find((t) => ccCount >= t.min && ccCount <= t.max)?.kpi ?? 0;
    ccBonus = Math.round((ccBase * ccPct) / 100);
  }

  return {
    fines: (finesRes.data ?? []).map((f: any) => ({
      date: f.date, amount: Number(f.amount_uzs || 0), reason: f.reason ?? "—",
      note: f.note ?? null, minutes: Number(f.minutes_late || 0),
    })),
    advances: (advRes.data ?? [])
      .filter((a: any) => {
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
    ccCount, ccBase, ccPct, ccBonus,
  };
}

export function PayslipDialog({
  target, onClose,
}: { target: PayslipTarget | null; onClose: () => void }) {
  const { lang } = useT();
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

      if (d && (d.ccCount > 0 || d.kpiApprovals.length > 0)) {
        const body: string[][] = [];
        if (d.ccCount > 0) {
          body.push(["Call-centre KPI", `${d.ccCount} ta shartnoma`, `bosqich: ${nf(d.ccBase)} × ${d.ccPct}%`, nf(d.ccBonus)]);
        }
        d.kpiApprovals.forEach((k) =>
          body.push([`Shartnoma bonusi (${k.role})`, k.client, k.contractNo ?? "—", nf(k.bonus)]),
        );
        body.push(["Jami bonus", "", "", nf(d.ccBonus + d.kpiApprovals.reduce((a, k) => a + k.bonus, 0))]);
        tables.push({
          title: "Bonus qanday hisoblandi",
          head: ["Manba", "Mijoz / hajm", "Izoh", "Summa"],
          body,
          align: ["left", "left", "left", "right"],
        });
      }

      if (d && d.fines.length) {
        tables.push({
          title: "Jarimalar tafsiloti",
          head: ["Sana", "Sabab", "Kechikish", "Izoh", "Summa"],
          body: [
            ...d.fines.map((f) => [f.date, f.reason, f.minutes > 0 ? `${f.minutes} daq` : "—", f.note ?? "—", `-${nf(f.amount)}`]),
            ["Jami jarima", "", "", "", `-${nf(d.fines.reduce((a, f) => a + f.amount, 0))}`],
          ],
          align: ["left", "left", "left", "left", "right"],
        });
      }

      if (d && d.advances.length) {
        tables.push({
          title: "Avanslar",
          head: ["Sana", "Maqsad", "Holat", "Summa"],
          body: [
            ...d.advances.map((a) => [a.date, a.purpose, a.status, nf(a.amount)]),
            ["Jami avans", "", "", nf(d.advances.reduce((a, x) => a + x.amount, 0))],
          ],
          align: ["left", "left", "left", "right"],
        });
      }

      if (d && d.payments.length) {
        tables.push({
          title: "To'lovlar",
          head: ["Sana", "Turi", "Izoh", "Summa"],
          body: [
            ...d.payments.map((p) => [p.date, p.kind === "advance" ? "avans" : "to'lov", p.note ?? "—", nf(p.amount)]),
            ["Jami to'langan", "", "", nf(paidTotal)],
            ["Qoldiq", "", "", nf(Math.max(0, target.gross - paidTotal))],
          ],
          align: ["left", "left", "left", "right"],
        });
      }

      await exportPayslipPdf({
        filename: `oylik-${target.employee_name.replace(/\s+/g, "-")}-${target.year}-${String(target.month).padStart(2, "0")}.pdf`,
        employee: target.employee_name,
        period: periodLabel,
        summary: [
          { label: "Belgilangan (asosiy) oylik", value: nf(Number(target.fixed_amount)) },
          { label: "Bonus / KPI", value: `+ ${nf(Number(target.kpi_amount))}`, tone: "primary" },
          { label: "Jarimalar", value: `- ${nf(Number(target.penalty_amount))}`, tone: "danger" },
          { label: "Hisoblangan oylik (jami)", value: nf(target.gross), strong: true },
          { label: "Oldindan olingan avans", value: target.advance > 0 ? `- ${nf(target.advance)}` : "—", tone: "muted" },
          { label: "Qo'lga beriladigan summa", value: nf(target.total), strong: true, tone: "primary" },
        ],
        notes: [
          "Formula: Asosiy oylik + Bonus - Jarima = Hisoblangan oylik. Avans ilgari to'langani uchun faqat qo'lga beriladigan summani kamaytiradi.",
        ],
        tables,
        footNote: target.note,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "PDF yaratilmadi");
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
            <FileText className="h-5 w-5 text-primary" /> Oylik hisob varaqasi
          </DialogTitle>
          <DialogDescription>
            {target.employee_name} — {periodLabel}. Har bir summa qanday hisoblangani batafsil ko‘rsatilgan.
          </DialogDescription>
        </DialogHeader>

        <div ref={contentRef} className="space-y-4">
          {/* Umumiy */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-sm font-semibold">1. Umumiy hisob</div>
            <Row label="Belgilangan (asosiy) oylik" value={nf(Number(target.fixed_amount))} />
            <Row label="Bonus / KPI" value={`+ ${nf(Number(target.kpi_amount))}`} tone="primary" />
            <Row label="Jarimalar" value={`− ${nf(Number(target.penalty_amount))}`} tone="destructive" />
            <Row label="Hisoblangan oylik (jami)" value={nf(target.gross)} />
            <Row label="Oldindan olingan avans" value={target.advance > 0 ? `− ${nf(target.advance)}` : "—"} tone="muted" />
            <Row label="Qo‘lga beriladigan summa" value={nf(target.total)} tone="primary" />
            <div className="mt-2 rounded bg-muted p-2 text-xs text-muted-foreground">
              Formula: Asosiy oylik + Bonus − Jarima = Hisoblangan oylik. Avans ilgari to‘langani uchun
              faqat qo‘lga beriladigan summani kamaytiradi.
            </div>
          </section>

          {/* Bonus izohi */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-sm font-semibold">2. Bonus nima uchun shunday chiqdi</div>
            {isLoading ? (
              <div className="py-4 text-sm text-muted-foreground">Yuklanmoqda…</div>
            ) : (
              <div className="space-y-3">
                {data && data.ccCount > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Call-centre KPI</div>
                    <Row label="Oyda yopilgan shartnomalar soni" value={`${data.ccCount} ta`} />
                    <Row label="Bosqich bo‘yicha asosiy oylik" value={nf(data.ccBase)} />
                    <Row label="Bosqich KPI foizi" value={`${data.ccPct}%`} />
                    <Row label={`Bonus = ${nf(data.ccBase)} × ${data.ccPct}%`} value={nf(data.ccBonus)} tone="primary" />
                  </div>
                )}

                {data && data.kpiApprovals.length > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Tasdiqlangan shartnoma bonuslari
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1">Mijoz</th>
                          <th className="py-1">Shartnoma</th>
                          <th className="py-1">Rol</th>
                          <th className="py-1 text-right">Bonus</th>
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
                          <td className="py-1 font-semibold" colSpan={3}>Jami</td>
                          <td className="py-1 text-right font-semibold text-primary">
                            {nf(data.kpiApprovals.reduce((a, k) => a + k.bonus, 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {data && data.ccCount === 0 && data.kpiApprovals.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Bu oy uchun avtomatik bonus manbasi topilmadi
                    {Number(target.kpi_amount) > 0
                      ? " — bonus qo‘lda kiritilgan (izohga qarang)."
                      : " va bonus hisoblanmagan."}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Jarimalar */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-sm font-semibold">3. Jarimalar tafsiloti</div>
            {(data?.fines.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">Bu oyda jarima yo‘q.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1">Sana</th>
                    <th className="py-1">Sabab</th>
                    <th className="py-1">Kechikish</th>
                    <th className="py-1">Izoh</th>
                    <th className="py-1 text-right">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.fines.map((f, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1">{f.date}</td>
                      <td className="py-1">{f.reason}</td>
                      <td className="py-1 text-muted-foreground">{f.minutes > 0 ? `${f.minutes} daq` : "—"}</td>
                      <td className="py-1 text-muted-foreground">{f.note ?? "—"}</td>
                      <td className="py-1 text-right text-destructive">−{nf(f.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className="py-1 font-semibold" colSpan={4}>Jami jarima</td>
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
            <div className="mb-2 text-sm font-semibold">4. Avans va to‘lovlar</div>
            <div className="mb-3">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Avanslar</div>
              {(data?.advances.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground">Avans olinmagan.</div>
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
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">To‘lovlar</div>
              {(data?.payments.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground">Hali to‘lov qilinmagan.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data!.payments.map((p, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1">{p.date}</td>
                        <td className="py-1 text-muted-foreground">{p.kind === "advance" ? "avans" : "to‘lov"}</td>
                        <td className="py-1 text-muted-foreground">{p.note ?? "—"}</td>
                        <td className="py-1 text-right">{nf(p.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border">
                      <td className="py-1 font-semibold" colSpan={3}>Jami to‘langan</td>
                      <td className="py-1 text-right font-semibold">{nf(paidTotal)}</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="py-1 font-semibold" colSpan={3}>Qoldiq</td>
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
                Izoh: {target.note}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Yopish</Button>
          <Button onClick={onExport} disabled={exporting || isLoading}>
            {exporting ? <RefreshCw className="animate-spin" /> : <FileText />}
            {exporting ? "Tayyorlanmoqda…" : "PDF qilib olish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
