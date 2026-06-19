import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { AlertTriangle, Link2, Trash2, Plus, FileText } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import {
  getJarimaData, linkTelegramToEmployee, saveSchedule, saveFineRule, deleteFineRule,
} from "@/lib/jarima.functions";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo.png";


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

async function generateFinePdf(fine: FineForPdf, approverName: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await getLogoDataUrl();

  if (logo) {
    try { doc.addImage(logo, "PNG", 40, 32, 56, 56); } catch {}
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("GOFORVISA", 110, 56);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Rasmiy jarima dalolatnomasi", 110, 74);

  doc.setDrawColor(180);
  doc.line(40, 100, pageW - 40, 100);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("JARIMA DALOLATNOMASI", pageW / 2, 130, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Sana: ${fine.date}`, 40, 160);
  doc.text(`Hujjat raqami: JR-${fine.date.replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`, pageW - 40, 160, { align: "right" });

  autoTable(doc, {
    startY: 180,
    head: [["Ko'rsatkich", "Qiymat"]],
    body: [
      ["Xodim", fine.employeeName],
      ["Kechikish (daqiqa)", String(fine.minutes_late)],
      ["Sabab", fine.reason || "—"],
      ["Jarima summasi", `${new Intl.NumberFormat("uz-UZ").format(Math.round(fine.amount_uzs))} so'm`],
    ],
    styles: { fontSize: 11, cellPadding: 8 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    columnStyles: { 0: { cellWidth: 180, fontStyle: "bold" } },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 300;

  doc.setFontSize(10);
  doc.text(
    "Ushbu dalolatnoma asosida xodimga belgilangan miqdorda jarima qo'llanildi va",
    40, finalY + 30,
  );
  doc.text("tegishli hisobotlarga kiritildi.", 40, finalY + 46);

  const sigY = finalY + 110;
  doc.setFont("helvetica", "bold");
  doc.text("Tasdiqladi:", 40, sigY);
  doc.setFont("helvetica", "normal");
  doc.text(approverName || "—", 40, sigY + 20);
  doc.setDrawColor(120);
  doc.line(40, sigY + 26, 260, sigY + 26);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("(F.I.Sh. va imzo)", 40, sigY + 40);

  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text("M.O'.", pageW - 80, sigY + 20);

  doc.save(`jarima-${fine.employeeName.replace(/\s+/g, "_")}-${fine.date}.pdf`);
}

const UZ_MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
];

type MonthlyFine = { date: string; employee_id: string; amount_uzs: number };

async function generateMonthlyPdf(
  year: number,
  month: number, // 1-12
  employees: { id: string; full_name: string }[],
  fines: MonthlyFine[],
  approverName: string,
) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await getLogoDataUrl();

  if (logo) {
    try { doc.addImage(logo, "PNG", 30, 24, 44, 44); } catch {}
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("GOFORVISA", 84, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Oylik jarimalar hisoboti", 84, 58);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`${UZ_MONTHS[month - 1]} ${year}`, pageW / 2, 50, { align: "center" });

  // Build matrix: employeeId -> day -> amount
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
    startY: 85,
    head,
    body,
    foot: [totalRow],
    styles: { fontSize: 6.5, cellPadding: 2, halign: "center", overflow: "linebreak" },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 7 },
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
    columnStyles: { 0: { halign: "left", cellWidth: 90, fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index > 0 && data.column.index <= daysInMonth) {
        if (data.cell.raw === "0") {
          data.cell.styles.textColor = [180, 180, 180];
        } else {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 400;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Tasdiqladi:", 40, finalY + 40);
  doc.setFont("helvetica", "normal");
  doc.text(approverName || "—", 40, finalY + 56);
  doc.setDrawColor(120);
  doc.line(40, finalY + 62, 240, finalY + 62);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("(F.I.Sh. va imzo)   M.O'.", 40, finalY + 74);

  doc.save(`jarima-${year}-${String(month).padStart(2, "0")}.pdf`);
}


function JarimaPage() {
  const { t } = useT();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();

  const fetchData = useServerFn(getJarimaData);
  const linkFn = useServerFn(linkTelegramToEmployee);
  const saveSchedFn = useServerFn(saveSchedule);
  const saveRuleFn = useServerFn(saveFineRule);
  const delRuleFn = useServerFn(deleteFineRule);

  const qc = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees").select("id, full_name").order("full_name");
      if (error) throw error;
      return (data ?? []) as Emp[];
    },
    enabled: !!user,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["jarima-data"],
    queryFn: () => fetchData(),
    enabled: !!user,
  });

  const { data: approverName = "" } = useQuery({
    queryKey: ["my-display-name", user?.id],
    queryFn: async () => {
      if (!user) return "";
      const { data } = await supabase
        .from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      return data?.display_name || user.email || "";
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

  const linkMut = useMutation({
    mutationFn: (v: { telegramRowId: string; employeeId: string | null }) => linkFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Bog'landi"); },
    onError: (e: any) => toast.error(e.message),
  });
  const schedMut = useMutation({
    mutationFn: (v: { employeeId: string; weekday: number; startTime: string; isWorking: boolean }) =>
      saveSchedFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Saqlandi"); },
    onError: (e: any) => toast.error(e.message),
  });
  const ruleMut = useMutation({
    mutationFn: (v: { id?: string; min: number; max: number | null; amount: number; label: string | null }) =>
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
      <main className="md:ml-56 p-6">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("nav.fines")}</h1>
        </div>

        {isLoading ? (
          <Card className="p-12 text-center text-muted-foreground">Yuklanmoqda...</Card>
        ) : (
          <Tabs defaultValue="today" className="space-y-4">
            <TabsList>
              <TabsTrigger value="today">Bugun</TabsTrigger>
              <TabsTrigger value="history">Tarix</TabsTrigger>
              {isAdmin && <TabsTrigger value="settings">Sozlamalar</TabsTrigger>}
            </TabsList>

            {/* === BUGUN === */}
            <TabsContent value="today" className="space-y-4">
              <Card className="p-4">
                <div className="font-medium mb-3">Bugun kelganlar ({todayAttendance.length})</div>
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
                    approverName={approverName}
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sana</TableHead>
                      <TableHead>Ishchi</TableHead>
                      <TableHead>Kechikish</TableHead>
                      <TableHead>Sabab</TableHead>
                      <TableHead className="text-right">Summa</TableHead>
                      <TableHead className="text-right">Dalolatnoma</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.fines || []).map(f => {
                      const name = empMap.get(f.employee_id) || "—";
                      return (
                        <TableRow key={f.id}>
                          <TableCell>{f.date}</TableCell>
                          <TableCell>{name}</TableCell>
                          <TableCell>{f.minutes_late} daq</TableCell>
                          <TableCell>{f.reason}</TableCell>
                          <TableCell className="text-right">{fmt(f.amount_uzs)} so'm</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                if (!confirm(`Jarimani tasdiqlaysizmi?\n\nXodim: ${name}\nSumma: ${fmt(f.amount_uzs)} so'm\n\nTasdiqlovchi: ${approverName}`)) return;
                                try {
                                  await generateFinePdf({
                                    date: f.date,
                                    employeeName: name,
                                    minutes_late: f.minutes_late,
                                    amount_uzs: f.amount_uzs,
                                    reason: f.reason,
                                  }, approverName);
                                  toast.success("PDF tayyor");
                                } catch (e: any) {
                                  toast.error(e?.message || "Xatolik");
                                }
                              }}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Tasdiqlash & PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(data?.fines || []).length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Jarimalar yo'q</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>

              </Card>
            </TabsContent>

            {/* === SOZLAMALAR === */}
            {isAdmin && (
              <TabsContent value="settings" className="space-y-4">
                {/* Telegram bog'lash */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 className="h-4 w-4" />
                    <span className="font-medium">Telegram akkauntlar</span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Telegram</TableHead>
                        <TableHead>Ism</TableHead>
                        <TableHead>Ishchi</TableHead>
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
                              <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— bog'lanmagan —</SelectItem>
                                {employees.map(e => (
                                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(data?.telegram || []).length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">
                          Hali hech kim botga /start yubormagan
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>

                {/* Haftalik jadval */}
                <ScheduleEditor
                  employees={employees}
                  schedules={data?.schedules || []}
                  onSave={(v) => schedMut.mutate(v)}
                />

                {/* Jarima qoidalari */}
                <FineRulesEditor
                  rules={data?.rules || []}
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
  const [empId, setEmpId] = useState<string>("");
  const sched = schedules.filter(s => s.employee_id === empId);
  const getDay = (wd: number) =>
    sched.find(s => s.weekday === wd) || { start_time: "10:00", is_working: wd !== 0 };

  return (
    <Card className="p-4">
      <div className="font-medium mb-3">Haftalik ish jadvali</div>
      <Select value={empId} onValueChange={setEmpId}>
        <SelectTrigger className="w-[300px] mb-3"><SelectValue placeholder="Ishchini tanlang" /></SelectTrigger>
        <SelectContent>
          {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
        </SelectContent>
      </Select>
      {empId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {WEEKDAYS.map((d, wd) => {
            const cur = getDay(wd);
            return (
              <DayRow
                key={wd}
                label={d}
                startTime={cur.start_time.slice(0, 5)}
                isWorking={cur.is_working}
                onSave={(startTime, isWorking) => onSave({ employeeId: empId, weekday: wd, startTime, isWorking })}
              />
            );
          })}
        </div>
      )}
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
  rules, onSave, onDelete,
}: {
  rules: { id: string; min_minutes: number; max_minutes: number | null; amount_uzs: number; label: string | null }[];
  onSave: (v: { id?: string; min: number; max: number | null; amount: number; label: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [newMin, setNewMin] = useState(0);
  const [newMax, setNewMax] = useState("");
  const [newAmt, setNewAmt] = useState(0);
  const [newLabel, setNewLabel] = useState("");

  return (
    <Card className="p-4">
      <div className="font-medium mb-3">Jarima qoidalari (kechikish daqiqasiga qarab)</div>
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
          {rules.map(r => (
            <RuleRow key={r.id} rule={r} onSave={onSave} onDelete={onDelete} />
          ))}
          <TableRow>
            <TableCell><Input type="number" value={newMin} onChange={e => setNewMin(Number(e.target.value))} /></TableCell>
            <TableCell><Input type="number" placeholder="cheksiz" value={newMax} onChange={e => setNewMax(e.target.value)} /></TableCell>
            <TableCell><Input type="number" value={newAmt} onChange={e => setNewAmt(Number(e.target.value))} /></TableCell>
            <TableCell><Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="masalan: 10:00–10:30" /></TableCell>
            <TableCell>
              <Button size="sm" onClick={() => {
                onSave({ min: newMin, max: newMax === "" ? null : Number(newMax), amount: newAmt, label: newLabel || null });
                setNewMin(0); setNewMax(""); setNewAmt(0); setNewLabel("");
              }}><Plus className="h-4 w-4" /></Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
}

function RuleRow({
  rule, onSave, onDelete,
}: {
  rule: { id: string; min_minutes: number; max_minutes: number | null; amount_uzs: number; label: string | null };
  onSave: (v: { id: string; min: number; max: number | null; amount: number; label: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [min, setMin] = useState(rule.min_minutes);
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
          onSave({ id: rule.id, min, max: max === "" ? null : Number(max), amount: amt, label: label || null })
        }>Saqlash</Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(rule.id)}><Trash2 className="h-4 w-4" /></Button>
      </TableCell>
    </TableRow>
  );
}
