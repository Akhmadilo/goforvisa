import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppSidebar } from "@/components/app-sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { AlertTriangle, Link2, Trash2, Plus, FileText } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { useNavigate } from "@tanstack/react-router";


import { supabase } from "@/integrations/supabase/client";
import {
 getJarimaData, linkTelegramToEmployee, saveSchedule, saveFineRule, deleteFineRule,
 updateAttendanceCheckIn, setAbsenceFine, clearDay, setTelegramBotRole, deleteFine,
 deleteTelegramAccount,
} from "@/lib/jarima.functions";

const NO_REPORT_REASON = "Hisobot yozmagan";
function fineReasonLabel(reason?: string | null): string {
  if (!reason) return "—";
  if (reason === "late") return "Kech qolgani uchun";
  if (reason === "absent") return "Ishga kelmagani uchun";
  if (reason === NO_REPORT_REASON) return "Hisobot yozmagani uchun";
  return reason;
}
import { Pencil } from "lucide-react";
import {
  listAdvances, ceoDecideAdvance, financeDecideAdvance, markAdvancePaid, adminFinalizeAdvance,
  createAdvanceManual, getEmployeeMonth, changeAdvanceDeductMonth, type AdvanceRequest, type AdvanceStatus,
} from "@/lib/advances.functions";
import { useRoles } from "@/hooks/use-roles";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo.png";
import { LeavesSection } from "@/components/leaves-section";
import { WorkReportsSection } from "@/components/work-reports-section";


export const Route = createFileRoute("/jarima")({
  component: JarimaPage,
  head: () => ({
    meta: [
      { title: "Jarima — GoForVisa" },
      { name: "description", content: "Ishchilar jarimalari va Telegram bot orqali kelish nazorati" },
    ],
  }),
});

type Emp = { id: string; full_name: string };

const WEEKDAYS = ["Yak", "Du", "Se", "Cho", "Pa", "Ju", "Sha"];

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
}

function timeFromIso(iso: string): string {
  const d = new Date(iso);
  const t = new Date(d.getTime() + 5 * 3600 * 1000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

let _logoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string | null> {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    _logoDataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
    return _logoDataUrl;
  } catch {
    return null;
  }
}

type FineForPdf = {
  date: string;
  employeeName: string;
  minutes_late: number;
  amount_uzs: number;
  reason: string;
};

export type Signers = {
  owner: string;
  ceo: string;
  admin: string;
};


function drawHeader(doc: jsPDF, title: string, subtitle: string, logo: string | null, rightText?: string) {
  const pageW = doc.internal.pageSize.getWidth();
  // brand bar
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, pageW, 6, "F");

  if (logo) {
    try { doc.addImage(logo, "PNG", 32, 18, 48, 48); } catch {}
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 22, 48);
  doc.text("GOFORVISA", 92, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 116, 140);
  doc.text(subtitle, 92, 56);

  if (rightText) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 22, 48);
    doc.text(rightText, pageW - 32, 40, { align: "right" });
  }

  doc.setDrawColor(228, 230, 240);
  doc.setLineWidth(0.6);
  doc.line(32, 78, pageW - 32, 78);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 22, 48);
  doc.text(title, pageW / 2, 100, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

function drawSigners(doc: jsPDF, y: number, signers: Signers) {
  const pageW = doc.internal.pageSize.getWidth();
  const cols: { role: string; name: string }[] = [
    { role: "Owner", name: signers.owner || "—" },
    { role: "CEO", name: signers.ceo || "—" },
    { role: "Tasdiqladi (Admin)", name: signers.admin || "—" },
  ];
  const margin = 32;
  const totalW = pageW - margin * 2;
  const colW = totalW / 3;

  doc.setDrawColor(210, 214, 230);
  doc.setLineWidth(0.5);

  cols.forEach((c, i) => {
    const x = margin + i * colW + 12;
    const w = colW - 24;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110, 116, 140);
    doc.text(c.role.toUpperCase(), x, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(20, 22, 48);
    doc.text(c.name, x, y + 18);

    doc.line(x, y + 56, x + w, y + 56);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 144, 160);
    doc.text("Imzo / Sana", x, y + 68);
  });
  doc.setTextColor(0, 0, 0);
}

async function generateFinePdf(fine: FineForPdf, signers: Signers) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await getLogoDataUrl();

  drawHeader(doc, "JARIMA DALOLATNOMASI", "Rasmiy jarima dalolatnomasi", logo);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Sana: ${fine.date}`, 32, 128);
  doc.text(
    `Hujjat raqami: JR-${fine.date.replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`,
    pageW - 32, 128, { align: "right" },
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 150,
    head: [["Ko'rsatkich", "Qiymat"]],
    body: [
      ["Xodim", fine.employeeName],
      ["Kechikish (daqiqa)", String(fine.minutes_late)],
      ["Sabab", fine.reason || "—"],
      ["Jarima summasi", `${new Intl.NumberFormat("uz-UZ").format(Math.round(fine.amount_uzs))} so'm`],
    ],
    styles: { fontSize: 11, cellPadding: 10, lineColor: [228, 230, 240], lineWidth: 0.4 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 249, 253] },
    columnStyles: { 0: { cellWidth: 200, fontStyle: "bold", textColor: [60, 64, 90] } },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 300;
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(
    "Ushbu dalolatnoma asosida xodimga belgilangan miqdorda jarima qo'llanildi va",
    32, finalY + 28,
  );
  doc.text("tegishli hisobotlarga kiritildi.", 32, finalY + 44);
  doc.setTextColor(0);

  drawSigners(doc, finalY + 100, signers);
  doc.save(`jarima-${fine.employeeName.replace(/\s+/g, "_")}-${fine.date}.pdf`);
}

const UZ_MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
];

type MonthlyFine = { date: string; employee_id: string; amount_uzs: number };

async function generateMonthlyPdf(
  year: number,
  month: number,
  employees: { id: string; full_name: string }[],
  fines: MonthlyFine[],
  signers: Signers,
) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await getLogoDataUrl();

  drawHeader(
    doc,
    `${UZ_MONTHS[month - 1]} ${year} — Jarimalar hisoboti`,
    "Oylik jarimalar hisoboti",
    logo,
    `${UZ_MONTHS[month - 1]} ${year}`,
  );

  const matrix = new Map<string, Map<number, number>>();
  const totalsByEmp = new Map<string, number>();
  const totalsByDay = new Map<number, number>();
  let grandTotal = 0;

  for (const f of fines) {
    const d = new Date(f.date);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    const day = d.getDate();
    if (!matrix.has(f.employee_id)) matrix.set(f.employee_id, new Map());
    const row = matrix.get(f.employee_id)!;
    row.set(day, (row.get(day) || 0) + f.amount_uzs);
    totalsByEmp.set(f.employee_id, (totalsByEmp.get(f.employee_id) || 0) + f.amount_uzs);
    totalsByDay.set(day, (totalsByDay.get(day) || 0) + f.amount_uzs);
    grandTotal += f.amount_uzs;
  }

  const head = [["Ishchi", ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), "Jami"]];
  const body = employees.map(e => {
    const row = matrix.get(e.id);
    const cells: (string | number)[] = [e.full_name];
    for (let d = 1; d <= daysInMonth; d++) {
      const v = row?.get(d) || 0;
      cells.push(v === 0 ? "0" : fmt(v));
    }
    cells.push(fmt(totalsByEmp.get(e.id) || 0));
    return cells;
  });
  const totalRow: (string | number)[] = ["JAMI"];
  for (let d = 1; d <= daysInMonth; d++) totalRow.push(fmt(totalsByDay.get(d) || 0));
  totalRow.push(fmt(grandTotal));

  autoTable(doc, {
    startY: 115,
    head,
    body,
    foot: [totalRow],
    styles: { fontSize: 6.5, cellPadding: 2.5, halign: "center", overflow: "linebreak", lineColor: [228, 230, 240], lineWidth: 0.3 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 7 },
    footStyles: { fillColor: [238, 240, 250], textColor: [20, 22, 48], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 251, 254] },
    columnStyles: { 0: { halign: "left", cellWidth: 100, fontStyle: "bold", textColor: [40, 44, 70] } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index > 0 && data.column.index <= daysInMonth) {
        if (data.cell.raw === "0") {
          data.cell.styles.textColor = [200, 204, 214];
        } else {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 400;
  drawSigners(doc, finalY + 40, signers);
  doc.save(`jarima-${year}-${String(month).padStart(2, "0")}.pdf`);
}

// Per-employee monthly calendar PDF
type EmpCalendarDay = {
  day: number;
  weekday: number;
  isDayOff: boolean;
  checkIn: string | null;
  fineAmount: number;
  minutesLate: number;
  fineReason: string | null;
};

async function generateEmployeeCalendarPdf(
  employeeName: string,
  year: number,
  month: number,
  cells: EmpCalendarDay[],
  totals: { presentDays: number; fineDays: number; totalFine: number; daysInMonth: number },
  signers: Signers,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await getLogoDataUrl();

  drawHeader(
    doc,
    `${UZ_MONTHS_FULL[month - 1]} ${year}`,
    "Ishchi davomati va jarimalari",
    logo,
    employeeName,
  );

  // Summary strip
  doc.setFillColor(245, 246, 252);
  doc.roundedRect(32, 118, pageW - 64, 50, 6, 6, "F");
  doc.setFontSize(9);
  const stats = [
    { l: "Kelgan kunlar", v: String(totals.presentDays) },
    { l: "Jarima kunlar", v: String(totals.fineDays) },
    { l: "Oydagi kunlar", v: String(totals.daysInMonth) },
    { l: "Jami jarima", v: `${fmt(totals.totalFine)} so'm` },
  ];
  const colW = (pageW - 64) / stats.length;
  stats.forEach((s, i) => {
    const x = 32 + i * colW + 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 116, 140);
    doc.text(s.l, x, 138);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 22, 48);
    doc.text(s.v, x, 156);
    doc.setFontSize(9);
  });
  doc.setTextColor(0);

  // Calendar grid: 7 columns
  const firstWd = new Date(year, month - 1, 1).getDay();
  const map = new Map<number, EmpCalendarDay>();
  cells.forEach(c => map.set(c.day, c));

  type Row = (EmpCalendarDay | null)[];
  const rows: Row[] = [];
  let row: Row = Array(firstWd).fill(null);
  for (let d = 1; d <= totals.daysInMonth; d++) {
    row.push(map.get(d) || { day: d, weekday: 0, isDayOff: false, checkIn: null, fineAmount: 0, minutesLate: 0, fineReason: null });
    if (row.length === 7) { rows.push(row); row = []; }
  }
  if (row.length) { while (row.length < 7) row.push(null); rows.push(row); }

  const head = [["Yak", "Du", "Se", "Cho", "Pa", "Ju", "Sha"]];
  const body = rows.map(r => r.map(c => {
    if (!c) return "";
    const lines: string[] = [String(c.day)];
    if (c.isDayOff) lines.push("Dam");
    else if (c.fineReason === "absent") lines.push("Kelmadi", `-${fmt(c.fineAmount)}`);
    else if (c.checkIn) {
      lines.push(c.checkIn);
      if (c.fineAmount > 0) lines.push(`-${fmt(c.fineAmount)}`);
    } else lines.push("—");
    return lines.join("\n");
  }));

  autoTable(doc, {
    startY: 188,
    head,
    body,
    styles: {
      fontSize: 8.5,
      cellPadding: 5,
      halign: "left",
      valign: "top",
      minCellHeight: 56,
      lineColor: [220, 224, 236],
      lineWidth: 0.5,
    },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, halign: "center", fontSize: 9 },
    columnStyles: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, { cellWidth: (pageW - 64) / 7 }])),
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const r = rows[data.row.index];
      const c = r?.[data.column.index];
      if (!c) { data.cell.styles.fillColor = [250, 250, 252]; return; }
      if (c.isDayOff) data.cell.styles.fillColor = [241, 245, 249];
      else if (c.fineAmount > 0) {
        data.cell.styles.fillColor = [254, 232, 232];
        data.cell.styles.textColor = [127, 29, 29];
      }
      else if (c.checkIn) data.cell.styles.fillColor = [223, 250, 232];
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 500;
  drawSigners(doc, finalY + 40, signers);
  doc.save(`davomat-${employeeName.replace(/\s+/g, "_")}-${year}-${String(month).padStart(2, "0")}.pdf`);
}




function JarimaPage() {
  const { t } = useT();
  const { user, loading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const { isCeo, isFinance } = useRoles();
  const canSeeAll = isAdmin || isCeo || isFinance;
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = useNavigate();
  useEffect(() => {
    if (!authLoading && !permsLoading && user && !can("fines_section")) {
      navigate({ to: "/" });
    }
  }, [authLoading, permsLoading, user, can, navigate]);


  const fetchData = useServerFn(getJarimaData);
  const linkFn = useServerFn(linkTelegramToEmployee);
  const botRoleFn = useServerFn(setTelegramBotRole);
  const saveSchedFn = useServerFn(saveSchedule);
  const saveRuleFn = useServerFn(saveFineRule);
  const delRuleFn = useServerFn(deleteFineRule);
  const delFineFn = useServerFn(deleteFine);

  const qc = useQueryClient();

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["employees-min-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, user_id, terminated_at")
        .is("terminated_at", null)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as (Emp & { user_id: string | null; terminated_at: string | null })[];
    },
    enabled: !!user,
  });

  // Find the employee linked to the current user (for non-admin filtering)
  const myEmpId = useMemo(() => {
    if (canSeeAll || !user) return null;
    return allEmployees.find(e => e.user_id === user.id)?.id ?? null;
  }, [allEmployees, user, canSeeAll]);

  const employees = useMemo(
    () => canSeeAll ? allEmployees : allEmployees.filter(e => e.id === myEmpId),
    [allEmployees, canSeeAll, myEmpId]
  );

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["jarima-data"],
    queryFn: () => fetchData(),
    enabled: !!user,
  });

  // Filter attendance + fines for non-admins to their own employee row only
  const data = useMemo(() => {
    if (!rawData) return rawData;
    if (canSeeAll) return rawData;
    if (!myEmpId) return { ...rawData, attendance: [], fines: [], telegram: [] };
    return {
      ...rawData,
      attendance: (rawData.attendance || []).filter((a: any) => a.employee_id === myEmpId),
      fines: (rawData.fines || []).filter((f: any) => f.employee_id === myEmpId),
      telegram: (rawData.telegram || []).filter((tg: any) => tg.employee_id === myEmpId),
    };
  }, [rawData, canSeeAll, myEmpId]);

  const { data: signers = { owner: "", ceo: "", admin: "" } } = useQuery<Signers>({
    queryKey: ["pdf-signers", user?.id],
    queryFn: async () => {
      const adminName = user
        ? (await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle())
            .data?.display_name || user.email || ""
        : "";
      const { data: tgRows } = await supabase
        .from("employee_telegram")
        .select("bot_role, first_name, last_name, employee_id, employees(full_name)")
        .in("bot_role", ["owner", "ceo"]);
      const pick = (role: string) => {
        const row = (tgRows || []).find((r: any) => r.bot_role === role);
        if (!row) return "";
        const empName = (row as any).employees?.full_name;
        if (empName) return empName;
        return [row.first_name, row.last_name].filter(Boolean).join(" ");
      };
      return { owner: pick("owner"), ceo: pick("ceo"), admin: adminName };
    },
    enabled: !!user,
  });

  const empMap = useMemo(() => {

    const m = new Map<string, string>();
    employees.forEach(e => m.set(e.id, e.full_name));
    return m;
  }, [employees]);

  const today = useMemo(() => {
    const d = new Date(Date.now() + 5 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }, []);

  const todayAttendance = (data?.attendance || []).filter(a => a.date === today);
  const todayFines = (data?.fines || []).filter(f => f.date === today);
  const todayCheckedIds = new Set(todayAttendance.map(a => a.employee_id));
  const linkedEmpIds = new Set(
    (data?.telegram || []).filter(t => t.employee_id).map(t => t.employee_id as string)
  );
  const notArrived = employees.filter(e => linkedEmpIds.has(e.id) && !todayCheckedIds.has(e.id));


  const invalidate = () => qc.invalidateQueries({ queryKey: ["jarima-data"] });
  const delFineMut = useMutation({
    mutationFn: (id: string) => delFineFn({ data: { id } }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["emp-month"] }); toast.success("Jarima bekor qilindi"); },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });

  const linkMut = useMutation({
    mutationFn: (v: { telegramRowId: string; employeeId: string | null }) => linkFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Bog'landi"); },
    onError: (e: any) => toast.error(e.message),
  });
  const botRoleMut = useMutation({
    mutationFn: (v: { telegramRowId: string; botRole: "none" | "owner" | "ceo" | "financier" | "director" | "finance" }) => botRoleFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Lavozim saqlandi"); },
    onError: (e: any) => toast.error(e.message),
  });
  const schedMut = useMutation({
    mutationFn: (v: { employeeId: string; weekday: number; startTime: string; isWorking: boolean }) =>
      saveSchedFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Saqlandi"); },
    onError: (e: any) => toast.error(e.message),
  });
  const ruleMut = useMutation({
    mutationFn: (v: { id?: string; employeeId?: string | null; min: number | null; max: number | null; amount: number; label: string | null; kind?: "late" | "absence" }) =>
      saveRuleFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Saqlandi"); },
    onError: (e: any) => toast.error(e.message),
  });
  const delRuleMut = useMutation({
    mutationFn: (id: string) => delRuleFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("O'chirildi"); },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:ml-56 p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4 md:mb-6 pl-10 md:pl-0">
          <div className="h-9 w-9 md:h-10 md:w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
            <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
          </div>
          <h1 className="text-base md:text-xl font-bold">{t("nav.fines")}</h1>
        </div>

        {isLoading ? (
          <Card className="p-12 text-center text-muted-foreground">Yuklanmoqda...</Card>
        ) : (
          <Tabs defaultValue="today" className="space-y-4">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="today">Bugun</TabsTrigger>
              <TabsTrigger value="history">Tarix</TabsTrigger>
              <TabsTrigger value="byEmployee">Ishchi bo'yicha</TabsTrigger>
              <TabsTrigger value="advance">💰 Avans</TabsTrigger>
              <TabsTrigger value="leave">📅 Javob so'rash</TabsTrigger>
              <TabsTrigger value="work">📋 Bajarilgan ishlar</TabsTrigger>
              {isAdmin && <TabsTrigger value="settings">Sozlamalar</TabsTrigger>}
            </TabsList>

            {/* === BUGUN === */}
            <TabsContent value="today" className="space-y-4">
              <Card className="p-4">
                <div className="font-medium text-sm md:text-base mb-3">Bugun kelganlar ({todayAttendance.length})</div>
                <div className="overflow-x-auto -mx-4 px-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ishchi</TableHead>
                        <TableHead>Kelish vaqti</TableHead>
                        <TableHead>FACE ID</TableHead>
                        <TableHead>Kechikish</TableHead>
                        <TableHead className="text-right">Jarima</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {todayAttendance.map(a => {
                        const fine = todayFines.find(f => f.employee_id === a.employee_id);
                        return (
                          <TableRow key={a.id}>
                            <TableCell>{empMap.get(a.employee_id) || "—"}</TableCell>
                            <TableCell>{timeFromIso(a.check_in_at)}</TableCell>
                            <TableCell>{a.face_id_confirmed ? "✅" : "—"}</TableCell>
                            <TableCell>{fine ? `${fine.minutes_late} daq` : "—"}</TableCell>
                            <TableCell className="text-right">
                              {fine ? <Badge variant="destructive">{fmt(fine.amount_uzs)} so'm</Badge> : <Badge variant="secondary">0</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {todayAttendance.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Hech kim kelmadi</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              <Card className="p-4">
                <div className="font-medium mb-3">Hali kelmaganlar ({notArrived.length})</div>
                <div className="flex flex-wrap gap-2">
                  {notArrived.map(e => (
                    <Badge key={e.id} variant="outline">{e.full_name}</Badge>
                  ))}
                  {notArrived.length === 0 && <span className="text-muted-foreground">—</span>}
                </div>
              </Card>
            </TabsContent>

            {/* === TARIX === */}
            <TabsContent value="history">
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="font-medium">Oxirgi jarimalar</div>
                  <MonthlyExport
                    fines={(data?.fines || []) as MonthlyFine[]}
                    employees={employees}
                    signers={signers}
                  />
                </div>
                <div className="overflow-x-auto -mx-4 px-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sana</TableHead>
                        <TableHead>Ishchi</TableHead>
                        <TableHead>Kechikish</TableHead>
                        <TableHead>Sabab</TableHead>
                        <TableHead className="text-right">Summa</TableHead>
                        <TableHead className="text-right">Amal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.fines || []).map(f => {
                        const name = empMap.get(f.employee_id) || "—";
                        return (
                          <TableRow key={f.id}>
                            <TableCell>{f.date}</TableCell>
                            <TableCell>{name}</TableCell>
                            <TableCell>{f.reason === "absent" || f.reason === NO_REPORT_REASON ? "—" : `${f.minutes_late} daq`}</TableCell>
                            <TableCell>{fineReasonLabel(f.reason)}</TableCell>
                            <TableCell className="text-right">{fmt(f.amount_uzs)} so'm</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    if (!confirm(`Jarimani tasdiqlaysizmi?\n\nXodim: ${name}\nSumma: ${fmt(f.amount_uzs)} so'm\n\nTasdiqlovchi: ${signers.admin}`)) return;
                                    try {
                                      await generateFinePdf({
                                        date: f.date,
                                        employeeName: name,
                                        minutes_late: f.minutes_late,
                                        amount_uzs: f.amount_uzs,
                                        reason: fineReasonLabel(f.reason),
                                      }, signers);
                                      toast.success("PDF tayyor");
                                    } catch (e: any) {
                                      toast.error(e?.message || "Xatolik");
                                    }
                                  }}
                                >
                                  <FileText className="h-4 w-4 mr-1" />
                                  PDF
                                </Button>
                                {(isAdmin || isFinance) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                    disabled={delFineMut.isPending}
                                    onClick={() => {
                                      if (!confirm(`Jarimani bekor qilasizmi?\n\nXodim: ${name}\nSana: ${f.date}\nSumma: ${fmt(f.amount_uzs)} so'm`)) return;
                                      delFineMut.mutate(f.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(data?.fines || []).length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Jarimalar yo'q</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

              </Card>
            </TabsContent>

            {/* === ISHCHI BO'YICHA === */}
            <TabsContent value="byEmployee">
              <EmployeeMonthView employees={employees} signers={signers} />
            </TabsContent>

            {/* === AVANS === */}
            <TabsContent value="advance">
              <AdvanceTab employees={employees} empMap={empMap} />
            </TabsContent>

            {/* === JAVOB SO'RASH === */}
            <TabsContent value="leave">
              <LeavesSection />
            </TabsContent>

            {/* === BAJARILGAN ISHLAR === */}
            <TabsContent value="work">
              <WorkReportsSection />
            </TabsContent>




            {/* === SOZLAMALAR === */}
            {isAdmin && (
              <TabsContent value="settings" className="space-y-4">
                {/* Telegram bog'lash */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 className="h-4 w-4" />
                    <span className="font-medium text-sm md:text-base">Telegram akkauntlar</span>
                  </div>
                  <div className="overflow-x-auto -mx-4 px-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Telegram</TableHead>
                          <TableHead>Ism</TableHead>
                          <TableHead>Ishchi</TableHead>
                          <TableHead>Bot lavozimi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data?.telegram || []).map(tg => (
                          <TableRow key={tg.id}>
                            <TableCell>
                              {tg.telegram_username ? `@${tg.telegram_username}` : tg.telegram_id}
                            </TableCell>
                            <TableCell>{[tg.first_name, tg.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                            <TableCell>
                              <Select
                                value={tg.employee_id ?? "none"}
                                onValueChange={(v) => linkMut.mutate({
                                  telegramRowId: tg.id,
                                  employeeId: v === "none" ? null : v,
                                })}
                              >
                                <SelectTrigger className="w-[200px] md:w-[260px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">— bog'lanmagan —</SelectItem>
                                  {employees.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={tg.bot_role ?? "none"}
                                 onValueChange={(v) => botRoleMut.mutate({
                                   telegramRowId: tg.id,
                                   botRole: v as "none" | "owner" | "ceo" | "financier",
                                 })}
                               >
                                 <SelectTrigger className="w-[160px] md:w-[200px]"><SelectValue /></SelectTrigger>
                                 <SelectContent>
                                   <SelectItem value="none">— oddiy ishchi —</SelectItem>
                                   <SelectItem value="owner">Owner</SelectItem>
                                   <SelectItem value="ceo">CEO</SelectItem>
                                   <SelectItem value="financier">Moliyachi</SelectItem>
                                 </SelectContent>
                               </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                        {(data?.telegram || []).length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">
                            Hali hech kim botga /start yubormagan
                          </TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>

                {/* Haftalik jadval — har xodim uchun alohida */}
                <ScheduleEditor
                  employees={employees}
                  schedules={data?.schedules || []}
                  onSave={(v) => schedMut.mutate(v)}
                />

                {/* Jarima qoidalari — har xodim uchun alohida */}
                <FineRulesEditor
                  employees={employees}
                  rules={(data?.rules || []) as any}
                  onSave={(v) => ruleMut.mutate(v)}
                  onDelete={(id) => delRuleMut.mutate(id)}
                />
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>
    </div>
  );
}

function ScheduleEditor({
  employees, schedules, onSave,
}: {
  employees: Emp[];
  schedules: { employee_id: string; weekday: number; start_time: string; is_working: boolean }[];
  onSave: (v: { employeeId: string; weekday: number; startTime: string; isWorking: boolean }) => void;
}) {
  const getDay = (empId: string, wd: number) =>
    schedules.find(s => s.employee_id === empId && s.weekday === wd)
    || { start_time: "10:00", is_working: wd !== 0 };

  return (
    <Card className="p-4">
      <div className="font-medium mb-3">Haftalik ish jadvali (har xodim uchun alohida)</div>
      <Accordion type="multiple" className="w-full">
        {employees.map(emp => (
          <AccordionItem key={emp.id} value={emp.id}>
            <AccordionTrigger className="text-sm md:text-base">{emp.full_name}</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                {WEEKDAYS.map((d, wd) => {
                  const cur = getDay(emp.id, wd);
                  return (
                    <DayRow
                      key={wd}
                      label={d}
                      startTime={cur.start_time.slice(0, 5)}
                      isWorking={cur.is_working}
                      onSave={(startTime, isWorking) => onSave({ employeeId: emp.id, weekday: wd, startTime, isWorking })}
                    />
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
        {employees.length === 0 && (
          <div className="text-sm text-muted-foreground">Xodimlar yo'q.</div>
        )}
      </Accordion>
    </Card>
  );
}

function DayRow({
  label, startTime, isWorking, onSave,
}: { label: string; startTime: string; isWorking: boolean; onSave: (st: string, iw: boolean) => void }) {
  const [st, setSt] = useState(startTime);
  const [iw, setIw] = useState(isWorking);
  return (
    <div className="flex items-center gap-3 p-2 border rounded">
      <span className="w-10 font-medium">{label}</span>
      <Switch checked={iw} onCheckedChange={setIw} />
      <Input type="time" value={st} onChange={e => setSt(e.target.value)} className="w-32" disabled={!iw} />
      <Button size="sm" onClick={() => onSave(st, iw)}>Saqlash</Button>
    </div>
  );
}

function FineRulesEditor({
  employees, rules, onSave, onDelete,
}: {
  employees: Emp[];
  rules: { id: string; employee_id: string | null; min_minutes: number | null; max_minutes: number | null; amount_uzs: number; label: string | null; kind?: "late" | "absence" | string }[];
  onSave: (v: { id?: string; employeeId?: string | null; min: number | null; max: number | null; amount: number; label: string | null; kind?: "late" | "absence" }) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="p-4">
      <div className="font-medium mb-3">Jarima qoidalari (har xodim uchun alohida)</div>
      <Accordion type="multiple" className="w-full">
        {employees.map(emp => {
          const empRules = rules.filter(r => r.employee_id === emp.id);
          const globalRules = rules.filter(r => r.employee_id == null);
          return (
            <AccordionItem key={emp.id} value={emp.id}>
              <AccordionTrigger className="text-sm md:text-base">{emp.full_name}</AccordionTrigger>
              <AccordionContent>
                <EmployeeRules
                  employeeId={emp.id}
                  empRules={empRules}
                  globalRules={globalRules}
                  onSave={onSave}
                  onDelete={onDelete}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
        {employees.length === 0 && (
          <div className="text-sm text-muted-foreground">Xodimlar yo'q.</div>
        )}
      </Accordion>
    </Card>
  );
}

function EmployeeRules({
  employeeId, empRules, globalRules, onSave, onDelete,
}: {
  employeeId: string;
  empRules: { id: string; employee_id: string | null; min_minutes: number | null; max_minutes: number | null; amount_uzs: number; label: string | null; kind?: string }[];
  globalRules: { id: string; employee_id: string | null; min_minutes: number | null; max_minutes: number | null; amount_uzs: number; label: string | null; kind?: string }[];
  onSave: (v: { id?: string; employeeId?: string | null; min: number | null; max: number | null; amount: number; label: string | null; kind?: "late" | "absence" }) => void;
  onDelete: (id: string) => void;
}) {
  const [newMin, setNewMin] = useState(0);
  const [newMax, setNewMax] = useState("");
  const [newAmt, setNewAmt] = useState(0);
  const [newLabel, setNewLabel] = useState("");

  const lateRules = empRules.filter(r => (r.kind || "late") === "late");
  const absenceRule = empRules.find(r => r.kind === "absence");
  const [absAmt, setAbsAmt] = useState<number>(absenceRule ? Number(absenceRule.amount_uzs) : 0);

  const hasOwn = lateRules.length > 0;
  const fallbackLate = globalRules.filter(r => (r.kind || "late") === "late");

  return (
    <div className="space-y-4 pt-2">
      <div>
        <div className="text-xs text-muted-foreground mb-2">
          {hasOwn ? "Bu xodim uchun shaxsiy qoidalar" : `Hozir umumiy qoidalardan foydalanmoqda (${fallbackLate.length} ta). Quyida qo'shsangiz shaxsiy qoidalar ishlaydi.`}
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Min (daq)</TableHead>
                <TableHead>Max (daq)</TableHead>
                <TableHead>Summa (so'm)</TableHead>
                <TableHead>Yorliq</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lateRules.map(r => (
                <RuleRow key={r.id} rule={r as any} employeeId={employeeId} onSave={onSave} onDelete={onDelete} />
              ))}
              <TableRow>
                <TableCell><Input type="number" value={newMin} onChange={e => setNewMin(Number(e.target.value))} /></TableCell>
                <TableCell><Input type="number" placeholder="cheksiz" value={newMax} onChange={e => setNewMax(e.target.value)} /></TableCell>
                <TableCell><Input type="number" value={newAmt} onChange={e => setNewAmt(Number(e.target.value))} /></TableCell>
                <TableCell><Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="masalan: 10:00–10:30" /></TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => {
                    onSave({ employeeId, min: newMin, max: newMax === "" ? null : Number(newMax), amount: newAmt, label: newLabel || null, kind: "late" });
                    setNewMin(0); setNewMax(""); setNewAmt(0); setNewLabel("");
                  }}><Plus className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="border rounded p-3">
        <div className="font-medium text-sm mb-1">Kelmagan kun uchun jarima</div>
        <div className="text-xs text-muted-foreground mb-3">Xodim ish kunida (dam olish yoki tasdiqlangan ta'tilsiz) kelmasa shu summa qo'llaniladi.</div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground mb-1">Summa (so'm)</label>
            <Input
              type="number"
              className="w-40"
              value={absAmt}
              onChange={e => setAbsAmt(Number(e.target.value))}
            />
          </div>
          <Button
            size="sm"
            onClick={() => onSave({
              id: absenceRule?.id,
              employeeId,
              min: null,
              max: null,
              amount: absAmt,
              label: "Kelmagan kun",
              kind: "absence",
            })}
          >Saqlash</Button>
          {absenceRule && (
            <Button size="sm" variant="ghost" onClick={() => onDelete(absenceRule.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleRow({
  rule, employeeId, onSave, onDelete,
}: {
  rule: { id: string; min_minutes: number | null; max_minutes: number | null; amount_uzs: number; label: string | null };
  employeeId: string;
  onSave: (v: { id: string; employeeId?: string | null; min: number | null; max: number | null; amount: number; label: string | null; kind?: "late" | "absence" }) => void;
  onDelete: (id: string) => void;
}) {
  const [min, setMin] = useState<number>(rule.min_minutes ?? 0);
  const [max, setMax] = useState(rule.max_minutes == null ? "" : String(rule.max_minutes));
  const [amt, setAmt] = useState(Number(rule.amount_uzs));
  const [label, setLabel] = useState(rule.label || "");
  return (
    <TableRow>
      <TableCell><Input type="number" value={min} onChange={e => setMin(Number(e.target.value))} /></TableCell>
      <TableCell><Input type="number" placeholder="cheksiz" value={max} onChange={e => setMax(e.target.value)} /></TableCell>
      <TableCell><Input type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /></TableCell>
      <TableCell><Input value={label} onChange={e => setLabel(e.target.value)} /></TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" variant="secondary" onClick={() =>
          onSave({ id: rule.id, employeeId, min, max: max === "" ? null : Number(max), amount: amt, label: label || null, kind: "late" })
        }>Saqlash</Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(rule.id)}><Trash2 className="h-4 w-4" /></Button>
      </TableCell>
    </TableRow>
  );
}

function MonthlyExport({
  fines, employees, signers,
}: {
  fines: MonthlyFine[];
  employees: Emp[];
  signers: Signers;
}) {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  return (
    <div className="flex items-center gap-2">
      <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {UZ_MONTHS.map((m, i) => (
            <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
        <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        onClick={async () => {
          try {
            await generateMonthlyPdf(year, month, employees, fines, signers);
            toast.success("Oylik PDF tayyor");
          } catch (e: any) {
            toast.error(e?.message || "Xatolik");
          }
        }}
      >
        <FileText className="h-4 w-4 mr-1" />
        Oylik PDF
      </Button>
    </div>
  );
}

// ============================================================
// EmployeeMonthView — per-employee day-by-day grid
// ============================================================

const UZ_MONTHS_FULL = [
  "Yanvar","Fevral","Mart","Aprel","May","Iyun",
  "Iyul","Avgust","Sentyabr","Oktyabr","Noyabr","Dekabr",
];

function EmployeeMonthView({ employees, signers }: { employees: Emp[]; signers: Signers }) {
  const now = new Date();
  const [empId, setEmpId] = useState<string>("");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const { isAdmin, isFinance } = useRoles();
  const canEditAttendance = isAdmin || isFinance;
  const qc = useQueryClient();

  type EditState = {
    date: string;
    mode: "present" | "absent";
    time: string;
    amount: string;
    note: string;
  };
  const [editing, setEditing] = useState<EditState | null>(null);
  const updateFn = useServerFn(updateAttendanceCheckIn);
  const absenceFn = useServerFn(setAbsenceFine);
  const clearFn = useServerFn(clearDay);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["emp-month", empId, year, month] });
    qc.invalidateQueries({ queryKey: ["jarima"] });
  };
  const updateMut = useMutation({
    mutationFn: async (e: EditState) => {
      if (e.mode === "present") {
        return updateFn({ data: { employeeId: empId, date: e.date, checkInLocal: e.time } });
      }
      const amt = Number(e.amount.replace(/[^0-9]/g, "")) || 0;
      return absenceFn({ data: { employeeId: empId, date: e.date, amountUzs: amt, note: e.note || null } });
    },
    onSuccess: () => {
      toast.success("Saqlandi");
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const clearMut = useMutation({
    mutationFn: (date: string) => clearFn({ data: { employeeId: empId, date } }),
    onSuccess: () => {
      toast.success("Tozalandi");
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const delFineFn = useServerFn(deleteFine);
  const delFineMut = useMutation({
    mutationFn: (id: string) => delFineFn({ data: { id } }),
    onSuccess: () => { toast.success("Jarima bekor qilindi"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });

  const fetchFn = useServerFn(getEmployeeMonth);
  const { data, isLoading } = useQuery({
    queryKey: ["emp-month", empId, year, month],
    queryFn: () => fetchFn({ data: { employeeId: empId, year, month } }),
    enabled: !!empId,
  });

  const days = data?.daysInMonth ?? new Date(year, month, 0).getDate();
  const startWeekday = new Date(year, month - 1, 1).getDay(); // 0=Sun

  const dayMap = useMemo(() => {
    const m = new Map<number, { att?: any; fine?: any; leave?: any }>();
    (data?.attendance || []).forEach((a: any) => {
      const d = Number(a.date.slice(8, 10));
      m.set(d, { ...(m.get(d) || {}), att: a });
    });
    (data?.fines || []).forEach((f: any) => {
      const d = Number(f.date.slice(8, 10));
      m.set(d, { ...(m.get(d) || {}), fine: f });
    });
    ((data as any)?.leaves || []).forEach((l: any) => {
      const d = Number(l.date.slice(8, 10));
      m.set(d, { ...(m.get(d) || {}), leave: l });
    });
    return m;
  }, [data]);

  const schedByWd = useMemo(() => {
    const m = new Map<number, any>();
    (data?.schedules || []).forEach((s: any) => m.set(s.weekday, s));
    return m;
  }, [data]);

  const totalFine = useMemo(
    () => (data?.fines || []).reduce((s: number, f: any) => s + Number(f.amount_uzs || 0), 0),
    [data],
  );
  const presentDays = (data?.attendance || []).length;
  const fineCount = (data?.fines || []).length;
  const workingDays = useMemo(() => {
    let count = 0;
    for (let d = 1; d <= days; d++) {
      const wd = new Date(year, month - 1, d).getDay();
      // Yakshanba (0) — hamma uchun dam olish kuni. Qolgan kunlar ish kuni.
      if (wd !== 0) count++;
    }
    return count;
  }, [days, year, month]);


  const openEdit = (dateStr: string, att?: any, fine?: any) => {
    const isAbsent = !att && !!fine;
    setEditing({
      date: dateStr,
      mode: isAbsent ? "absent" : "present",
      time: att ? timeFromIso(att.check_in_at) : "09:00",
      amount: fine?.reason === "absent" ? String(fine.amount_uzs ?? "") : "",
      note: fine?.reason === "absent" ? (fine.note ?? "") : "",
    });
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground mb-1 block">Ishchi</label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder="Ishchini tanlang..." /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Oy</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UZ_MONTHS_FULL.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Yil</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!empId || isLoading}
            onClick={async () => {
              try {
                const emp = employees.find(e => e.id === empId);
                if (!emp) return;
                const pdfCells: EmpCalendarDay[] = Array.from({ length: days }, (_, i) => {
                  const d = i + 1;
                  const cell = dayMap.get(d);
                  const wd = new Date(year, month - 1, d).getDay();
                  const sched = schedByWd.get(wd);
                  return {
                    day: d,
                    weekday: wd,
                    isDayOff: sched?.is_working === false,
                    checkIn: cell?.att ? timeFromIso(cell.att.check_in_at) : null,
                    fineAmount: Number(cell?.fine?.amount_uzs || 0),
                    minutesLate: Number(cell?.fine?.minutes_late || 0),
                    fineReason: cell?.fine?.reason ?? null,
                  };
                });
                await generateEmployeeCalendarPdf(emp.full_name, year, month, pdfCells, {
                  presentDays, fineDays: fineCount, totalFine, daysInMonth: days,
                }, signers);
                toast.success("PDF tayyor");
              } catch (e: any) {
                toast.error(e?.message || "Xatolik");
              }
            }}
          >
            <FileText className="h-4 w-4 mr-1" />
            PDF
          </Button>
        </div>
      </Card>


      {!empId ? (
        <Card className="p-10 text-center text-muted-foreground">
          Ishchini tanlang
        </Card>
      ) : isLoading ? (
        <Card className="p-10 text-center text-muted-foreground">Yuklanmoqda...</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Kelgan kunlar</div>
              <div className="text-lg md:text-xl font-bold">{presentDays}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Jarima kunlar</div>
              <div className="text-lg md:text-xl font-bold">{fineCount}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Jami jarima</div>
              <div className="text-lg md:text-xl font-bold text-red-600 dark:text-red-400">{fmt(totalFine)} so'm</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Oydagi ish kunlari</div>
              <div className="text-lg md:text-xl font-bold">{workingDays}</div>
            </Card>
          </div>


          {/* Calendar grid */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">
              {UZ_MONTHS_FULL[month - 1]} {year}
            </div>
            <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground mb-1 text-center">
              {WEEKDAYS.map(w => <div key={w} className="py-1 font-medium">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startWeekday }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                const cell = dayMap.get(d);
                const wd = new Date(year, month - 1, d).getDay();
                const sched = schedByWd.get(wd);
                const isDayOff = sched && sched.is_working === false;
                const fine = cell?.fine;
                const att = cell?.att;
                const leave = cell?.leave;
                let bg = "bg-muted/30";
                if (isDayOff || leave) bg = "bg-sky-100 dark:bg-sky-950/40";
                else if (fine) bg = "bg-red-100 dark:bg-red-950/40";
                else if (att) bg = "bg-emerald-100 dark:bg-emerald-950/40";
                return (
                  <div key={d} className={cn(
                    "rounded border min-h-[52px] md:min-h-[68px] p-1 md:p-1.5 text-left relative group",
                    bg,
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold">{d}</div>
                      {canEditAttendance && !isDayOff && !leave && (
                        <button
                          type="button"
                          onClick={() => openEdit(
                            `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
                            att,
                            fine,
                          )}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          title="Kunni tahrirlash"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {leave ? (
                      <div className="text-[10px] text-sky-700 dark:text-sky-300 font-semibold" title={leave.reason || leave.note || ""}>Dam olish</div>
                    ) : isDayOff ? (
                      <div className="text-[10px] text-muted-foreground">Dam</div>
                    ) : fine?.reason === "absent" ? (
                      <>
                        <div className="text-[10px] text-red-700 dark:text-red-300 font-semibold" title="Ishga kelmagani uchun">Kelmadi</div>
                        <div className="text-[10px] text-red-700 dark:text-red-300 font-semibold">-{fmt(fine.amount_uzs)}</div>
                      </>
                    ) : fine?.reason === NO_REPORT_REASON ? (
                      <>
                        {att && <div className="text-[10px] tabular-nums">{timeFromIso(att.check_in_at)}</div>}
                        <div className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold" title="Hisobot yozmagani uchun">Hisobot yo'q</div>
                        <div className="text-[10px] text-red-700 dark:text-red-300 font-semibold">-{fmt(fine.amount_uzs)}</div>
                      </>
                    ) : att ? (
                      <>
                        <div className="text-[10px] tabular-nums">{timeFromIso(att.check_in_at)}</div>
                        {fine ? (
                          <div className="text-[10px] text-red-700 dark:text-red-300 font-semibold" title="Kech qolgani uchun">
                            Kech -{fmt(fine.amount_uzs)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-300">✓</div>
                        )}
                      </>
                    ) : (
                      <div className="text-[10px] text-muted-foreground">—</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-3 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-950/40 border" /> O'z vaqtida</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100 dark:bg-red-950/40 border" /> Jarima</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-sky-100 dark:bg-sky-950/40 border" /> Dam olish</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-muted/30 border" /> Kelmadi</span>
            </div>
          </Card>

          {/* Table view */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Kunlar ro'yxati</div>
            <div className="overflow-x-auto -mx-4 px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sana</TableHead>
                    <TableHead>Kun</TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead>Kelish</TableHead>
                    <TableHead>Kechikish</TableHead>
                    <TableHead className="text-right">Jarima</TableHead>
                    {canEditAttendance && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                    const cell = dayMap.get(d);
                    const wd = new Date(year, month - 1, d).getDay();
                    const sched = schedByWd.get(wd);
                    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const isDayOff = sched?.is_working === false;
                    return (
                      <TableRow key={d}>
                        <TableCell className="tabular-nums">{dateStr}</TableCell>
                        <TableCell>{WEEKDAYS[wd]}</TableCell>
                        <TableCell>
                          {cell?.leave ? <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" variant="outline">Dam olish</Badge>
                            : isDayOff ? <Badge variant="outline">Dam</Badge>
                            : cell?.fine?.reason === "absent" ? <Badge variant="destructive" title="Ishga kelmagani uchun">Kelmadi</Badge>
                            : cell?.fine?.reason === NO_REPORT_REASON ? <Badge variant="destructive" title="Hisobot yozmagani uchun">Hisobot yo'q</Badge>
                            : cell?.fine ? <Badge variant="destructive" title="Kech qolgani uchun">Kech qoldi</Badge>
                            : cell?.att ? <Badge variant="secondary">Kelgan</Badge>
                            : <Badge variant="outline">—</Badge>}
                        </TableCell>
                        <TableCell className="tabular-nums">{cell?.att ? timeFromIso(cell.att.check_in_at) : "—"}</TableCell>
                        <TableCell>{cell?.fine && cell.fine.reason === "late" ? `${cell.fine.minutes_late} daq` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {cell?.fine ? <span className="text-red-600 dark:text-red-400 font-semibold">{fmt(cell.fine.amount_uzs)}</span> : "0"}
                        </TableCell>
                        {canEditAttendance && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {!isDayOff && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openEdit(dateStr, cell?.att, cell?.fine)}
                                  title="Kunni tahrirlash"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {cell?.fine && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                  disabled={delFineMut.isPending}
                                  onClick={() => {
                                    if (!confirm(`Jarimani bekor qilasizmi?\n\nSana: ${dateStr}\nSumma: ${fmt(cell.fine!.amount_uzs)} so'm`)) return;
                                    delFineMut.mutate(cell.fine!.id);
                                  }}
                                  title="Jarimani bekor qilish"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kunni tahrirlash</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Sana: <b className="text-foreground">{editing.date}</b></div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editing.mode === "present" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setEditing({ ...editing, mode: "present" })}
                >
                  Kelgan
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editing.mode === "absent" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setEditing({ ...editing, mode: "absent" })}
                >
                  Kelmadi
                </Button>
              </div>
              {editing.mode === "present" ? (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Kelish vaqti (Toshkent)</label>
                    <Input
                      type="time"
                      value={editing.time}
                      onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Saqlangach kechikish jarimasi qoidalar bo'yicha qayta hisoblanadi.
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Jarima summasi (so'm)</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9\s]*"
                      placeholder="120 000"
                      value={editing.amount}
                      onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Izoh (ixtiyoriy)</label>
                    <Input
                      placeholder="Sababi..."
                      value={editing.note}
                      onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="mr-auto text-red-600 hover:text-red-700"
              onClick={() => editing && clearMut.mutate(editing.date)}
              disabled={clearMut.isPending}
            >
              Tozalash
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Bekor</Button>
            <Button
              onClick={() => editing && updateMut.mutate(editing)}
              disabled={
                updateMut.isPending ||
                (editing?.mode === "present" && !editing?.time)
              }
            >
              {updateMut.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// AdvanceTab — request management with CEO + Finance workflow
// ============================================================

function statusBadge(s: AdvanceStatus) {
  const map: Record<AdvanceStatus, { label: string; variant: any }> = {
    pending: { label: "Direktor tasdig'i kutilmoqda (Telegram)", variant: "secondary" },
    ceo_approved: { label: "Direktor ✓ — Admin yakuniylashtirishi kutilmoqda", variant: "default" },
    approved: { label: "Tasdiqlandi — To'lov kutilmoqda", variant: "default" },
    paid: { label: "✅ Berildi (oylikdan ushlanadi)", variant: "secondary" },
    rejected: { label: "❌ Rad etildi", variant: "destructive" },
    cancelled: { label: "Bekor", variant: "outline" },
  };
  const it = map[s] || { label: s, variant: "outline" };
  return <Badge variant={it.variant}>{it.label}</Badge>;
}

function AdvanceTab({ employees, empMap }: { employees: Emp[]; empMap: Map<string, string> }) {
  const { isCeo, isAdmin: isAdm, canApproveAdvances } = useRoles();
  const qc = useQueryClient();
  const listFn = useServerFn(listAdvances);
  const ceoFn = useServerFn(ceoDecideAdvance);
  const adminFn = useServerFn(adminFinalizeAdvance);
  const changeDeductFn = useServerFn(changeAdvanceDeductMonth);
  const createFn = useServerFn(createAdvanceManual);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["advance-requests"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["advance-requests"] });

  const [decision, setDecision] = useState<{ id: string; approve: boolean; role: "ceo" | "admin" } | null>(null);
  const [note, setNote] = useState("");
  const nowTash = new Date(Date.now() + 5 * 3600 * 1000);
  const [deductYear, setDeductYear] = useState<number>(nowTash.getUTCFullYear());
  const [deductMonth, setDeductMonth] = useState<number>(nowTash.getUTCMonth() + 1);

  const monthOptions = useMemo(() => {
    const arr: { y: number; m: number; label: string }[] = [];
    const base = new Date(Date.UTC(nowTash.getUTCFullYear(), nowTash.getUTCMonth(), 1));
    for (let i = -3; i <= 6; i++) {
      const d = new Date(base);
      d.setUTCMonth(d.getUTCMonth() + i);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const names = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentyabr","Oktyabr","Noyabr","Dekabr"];
      arr.push({ y, m, label: `${names[m-1]} ${y}${i===0 ? " (joriy)" : ""}` });
    }
    return arr;
  }, []);

  const submitDecision = async () => {
    if (!decision) return;
    try {
      if (decision.role === "ceo") {
        await ceoFn({ data: { id: decision.id, approve: decision.approve, note: note || undefined } });
      } else {
        await adminFn({ data: { id: decision.id, approve: decision.approve, note: note || undefined, deductYear, deductMonth } });
      }
      toast.success(decision.approve ? "Tasdiqlandi" : "Rad etildi");
      setDecision(null);
      setNote("");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Xatolik");
    }
  };

  // Change deduction month for an already-paid advance
  const [editDeduct, setEditDeduct] = useState<{ id: string; y: number; m: number } | null>(null);
  const submitChangeDeduct = async () => {
    if (!editDeduct) return;
    try {
      await changeDeductFn({ data: { id: editDeduct.id, deductYear: editDeduct.y, deductMonth: editDeduct.m } });
      toast.success("Oylik o'zgartirildi");
      setEditDeduct(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Xatolik");
    }
  };



  // Manual create
  const [openCreate, setOpenCreate] = useState(false);
  const [newEmp, setNewEmp] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const submitCreate = async () => {
    const amt = Number(newAmt.replace(/[^\d]/g, ""));
    if (!newEmp || !amt || amt <= 0 || newPurpose.trim().length < 3) {
      toast.error("Hamma maydonlarni to'g'ri to'ldiring");
      return;
    }
    try {
      await createFn({ data: { employeeId: newEmp, amount: amt, purpose: newPurpose.trim() } });
      toast.success("So'rov yaratildi");
      setOpenCreate(false);
      setNewEmp(""); setNewAmt(""); setNewPurpose("");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Xatolik");
    }
  };

  const pending = list.filter(r => r.status === "pending");
  const awaitingAdmin = list.filter(r => r.status === "ceo_approved");
  const done = list.filter(r => r.status === "paid" || r.status === "approved" || r.status === "rejected");

  const monthNames = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentyabr","Oktyabr","Noyabr","Dekabr"];
  const renderRow = (r: any, actions?: React.ReactNode) => (
    <TableRow key={r.id}>
      <TableCell>{r.employee_id ? (empMap.get(r.employee_id) || "—") : "—"}</TableCell>
      <TableCell className="text-right tabular-nums font-semibold">{fmt(r.amount_uzs)}</TableCell>
      <TableCell className="max-w-[280px]"><div className="truncate" title={r.purpose}>{r.purpose}</div></TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {statusBadge(r.status)}
          {r.status === "paid" && r.deducted_month && r.deducted_year && (
            isAdm ? (
              <button
                type="button"
                onClick={() => setEditDeduct({ id: r.id, y: r.deducted_year, m: r.deducted_month })}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline text-left"
                title="Bosing — qaysi oylikdan ushlanishini o'zgartirish"
              >
                📅 {monthNames[r.deducted_month - 1]} {r.deducted_year} oyligidan ✏️
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                📅 {monthNames[r.deducted_month - 1]} {r.deducted_year} oyligidan
              </span>
            )
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {new Date(r.created_at).toLocaleDateString("uz-UZ")}
      </TableCell>
      <TableCell className="text-right">{actions}</TableCell>
    </TableRow>
  );


  const section = (
    title: string,
    rows: AdvanceRequest[],
    actionFor: (r: AdvanceRequest) => React.ReactNode,
  ) => (
    <Card className="p-4">
      <div className="font-medium text-sm md:text-base mb-3">{title} ({rows.length})</div>
      <div className="overflow-x-auto -mx-4 px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Xodim</TableHead>
              <TableHead className="text-right">Summa</TableHead>
              <TableHead>Maqsad</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sana</TableHead>
              <TableHead className="text-right">Amal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => renderRow(r, actionFor(r)))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">—</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );

  if (isLoading) {
    return <Card className="p-10 text-center text-muted-foreground">Yuklanmoqda...</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">Avans so'rovlari</div>
            <div className="text-xs text-muted-foreground mt-1">
              Ishchi botda <b>💰 Avans so'rash</b> tugmasini bossa, direktorga Telegram orqali xabar boradi. Direktor tasdiqlasa, admin shu yerda yakuniylashtiradi va summa keyingi oylikdan ushlanadi.
            </div>
          </div>
          {canApproveAdvances && (
            <Button size="sm" onClick={() => setOpenCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Qo'lda yaratish
            </Button>
          )}
        </div>
      </Card>

      {section(
        "1️⃣ Direktor tasdig'i kutilmoqda (Telegram)",
        pending,
        (r) => isAdm ? (
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setNote(""); setDecision({ id: r.id, approve: true, role: "ceo" }); }}>Admin override: Tasdiq</Button>
            <Button size="sm" variant="ghost" onClick={() => { setNote(""); setDecision({ id: r.id, approve: false, role: "ceo" }); }}>Rad</Button>
          </div>
        ) : <span className="text-xs text-muted-foreground">Direktor Telegramdan tasdiqlaydi</span>,
      )}

      {section(
        "2️⃣ Admin yakuniy tasdig'i kutilmoqda",
        awaitingAdmin,
        (r) => isAdm ? (
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="default" onClick={() => { setNote(""); setDeductYear(nowTash.getUTCFullYear()); setDeductMonth(nowTash.getUTCMonth()+1); setDecision({ id: r.id, approve: true, role: "admin" }); }}>Tasdiq + Ber</Button>
            <Button size="sm" variant="outline" onClick={() => { setNote(""); setDecision({ id: r.id, approve: false, role: "admin" }); }}>Rad</Button>
          </div>
        ) : <span className="text-xs text-muted-foreground">Faqat admin</span>,
      )}

      {section("📜 Tarix", done, () => null)}

      {/* Decision dialog */}
      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision?.approve ? "Tasdiqlash" : "Rad etish"}</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Izoh {!decision?.approve && <span className="text-red-500">*</span>}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={decision?.approve ? "Ixtiyoriy" : "Sababini yozing"}
              maxLength={500}
            />
            {decision?.role === "admin" && decision?.approve && (
              <div className="mt-3">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Qaysi oylikdan ushlansin?
                </label>
                <Select
                  value={`${deductYear}-${deductMonth}`}
                  onValueChange={(v) => {
                    const [y, m] = v.split("-").map(Number);
                    setDeductYear(y); setDeductMonth(m);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(o => (
                      <SelectItem key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Bekor</Button>
            <Button
              onClick={submitDecision}
              disabled={!decision?.approve && note.trim().length < 3}
              variant={decision?.approve ? "default" : "destructive"}
            >
              {decision?.approve ? "Tasdiq" : "Rad etish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change deduction month dialog */}
      <Dialog open={!!editDeduct} onOpenChange={(o) => !o && setEditDeduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ushlash oyini o'zgartirish</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Qaysi oylikdan ushlansin?</label>
            {editDeduct && (
              <Select
                value={`${editDeduct.y}-${editDeduct.m}`}
                onValueChange={(v) => {
                  const [y, m] = v.split("-").map(Number);
                  setEditDeduct({ ...editDeduct, y, m });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map(o => (
                    <SelectItem key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">
              Eski oyning avans ushlanmasi kamayadi, yangi oyga qo'shiladi.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDeduct(null)}>Bekor</Button>
            <Button onClick={submitChangeDeduct}>Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual create */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avans so'rovi (qo'lda)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Xodim</label>
              <Select value={newEmp} onValueChange={setNewEmp}>
                <SelectTrigger><SelectValue placeholder="Tanlang..." /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Summa (so'm)</label>
              <Input value={newAmt} onChange={(e) => setNewAmt(e.target.value)} placeholder="500000" inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Maqsad</label>
              <Textarea value={newPurpose} onChange={(e) => setNewPurpose(e.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCreate(false)}>Bekor</Button>
            <Button onClick={submitCreate}>Yaratish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

