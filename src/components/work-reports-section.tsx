import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import { syncMissingReportFines, setReportRequired, addManualFine, deleteFine } from "@/lib/jarima.functions";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

type WorkReport = {
  id: string;
  employee_id: string;
  telegram_id: number | null;
  date: string;
  content: string;
  created_at: string;
};
type Employee = { id: string; full_name: string; terminated_at: string | null; report_required?: boolean | null };

export function WorkReportsSection() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

  const { data: myRoles = [] } = useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return (data ?? []).map((r) => r.role as string);
    },
    enabled: !!user,
  });
  const canAccess = myRoles.includes("admin") || myRoles.includes("financier");

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-min-rr"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, terminated_at, report_required")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
    enabled: !!user,
  });

  const [empFilter, setEmpFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: reports = [] } = useQuery({
    queryKey: ["work_reports", empFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("work_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (empFilter !== "all") q = q.eq("employee_id", empFilter);
      if (dateFrom) q = q.gte("date", dateFrom);
      if (dateTo) q = q.lte("date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as WorkReport[];
    },
    enabled: !!user && canAccess,
  });

  useEffect(() => {
    if (!user || !canAccess) return;
    const ch = supabase
      .channel("work-reports-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_reports" }, () => {
        qc.invalidateQueries({ queryKey: ["work_reports"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, canAccess, qc]);

  // === Hisobot yozmagan → 20 000 so'm jarima ===
  const now = new Date();
  const [fineYear, setFineYear] = useState(now.getFullYear());
  const [fineMonth, setFineMonth] = useState(now.getMonth() + 1);
  const syncFn = useServerFn(syncMissingReportFines);
  const previewQ = useQuery({
    queryKey: ["missing-report-fines", fineYear, fineMonth],
    queryFn: () => syncFn({ data: { year: fineYear, month: fineMonth, persist: false } }),
    enabled: !!user && canAccess && isAdmin,
  });
  const applyMut = useMutation({
    mutationFn: () => syncFn({ data: { year: fineYear, month: fineMonth, persist: true } }),
    onSuccess: (r) => {
      toast.success(`${r.inserted} ta jarima qo'shildi`);
      qc.invalidateQueries({ queryKey: ["missing-report-fines"] });
      qc.invalidateQueries({ queryKey: ["jarima-data"] });
    },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });

  const [fineEmpFilter, setFineEmpFilter] = useState<string>("all");
  const [confirmingRow, setConfirmingRow] = useState<string | null>(null);
  const addFineForRowFn = useServerFn(addManualFine);
  const deleteFineFn = useServerFn(deleteFine);
  const confirmRowMut = useMutation({
    mutationFn: (v: { employeeId: string; date: string }) =>
      addFineForRowFn({ data: {
        employeeId: v.employeeId,
        date: v.date,
        amountUzs: 20000,
        reason: "Hisobot yozmagan",
        note: null,
      }}),
    onSuccess: () => {
      toast.success("Jarima qo'shildi");
      qc.invalidateQueries({ queryKey: ["missing-report-fines"] });
      qc.invalidateQueries({ queryKey: ["jarima-data"] });
    },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const cancelRowMut = useMutation({
    mutationFn: (id: string) => deleteFineFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Jarima bekor qilindi");
      qc.invalidateQueries({ queryKey: ["missing-report-fines"] });
      qc.invalidateQueries({ queryKey: ["jarima-data"] });
    },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });

  const setRequiredFn = useServerFn(setReportRequired);
  const setRequiredMut = useMutation({
    mutationFn: (v: { employeeId: string; required: boolean }) => setRequiredFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees-min-rr"] });
      qc.invalidateQueries({ queryKey: ["missing-report-fines"] });
    },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });

  const addFineFn = useServerFn(addManualFine);
  const [fineOpen, setFineOpen] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [mfEmp, setMfEmp] = useState<string>("");
  const [mfDate, setMfDate] = useState<string>(todayStr);
  const [mfAmount, setMfAmount] = useState<string>("20000");
  const [mfReason, setMfReason] = useState<string>("");
  const [mfNote, setMfNote] = useState<string>("");
  const addFineMut = useMutation({
    mutationFn: () => addFineFn({ data: {
      employeeId: mfEmp,
      date: mfDate,
      amountUzs: Number(mfAmount) || 0,
      reason: mfReason.trim() || "Boshqa",
      note: mfNote.trim() || null,
    }}),
    onSuccess: () => {
      toast.success("Jarima qo'shildi");
      setFineOpen(false);
      setMfEmp(""); setMfReason(""); setMfNote(""); setMfAmount("20000");
      qc.invalidateQueries({ queryKey: ["jarima-data"] });
    },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.full_name])), [employees]);

  const handleDelete = async (id: string) => {
    if (!confirm("Hisobotni o'chirishni tasdiqlaysizmi?")) return;
    const { error } = await supabase.from("work_reports").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("O'chirildi");
  };

  if (!canAccess) {
    return <Card className="p-10 text-center text-muted-foreground">Ruxsat yo'q</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Ishchi</label>
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Boshlanish</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tugash</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </Card>

      {isAdmin && (() => {
        const filteredMissing = (previewQ.data?.missing ?? []).filter(
          (m) => fineEmpFilter === "all" || m.employee_id === fineEmpFilter,
        );
        const pendingFiltered = filteredMissing.filter((m) => !m.already_fined);
        return (
        <Card className="p-4 border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="font-medium text-sm md:text-base">Hisobot yozmaganlar uchun jarima</span>
            <Badge variant="outline" className="ml-auto">20 000 so'm / kun</Badge>
          </div>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Yil</label>
              <Input type="number" className="w-24" value={fineYear} onChange={(e) => setFineYear(Number(e.target.value) || now.getFullYear())} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Oy</label>
              <Select value={String(fineMonth)} onValueChange={(v) => setFineMonth(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentyabr","Oktyabr","Noyabr","Dekabr"].map((n, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Xodim</label>
              <Select value={fineEmpFilter} onValueChange={setFineEmpFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barcha xodimlar</SelectItem>
                  {employees.filter(e => !e.terminated_at && e.report_required !== false).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm">
              <div className="text-muted-foreground">Aniqlangan kunlar</div>
              <div className="font-semibold text-base">
                {filteredMissing.length}{" "}
                <span className="text-xs text-muted-foreground">
                  ({pendingFiltered.length} yangi)
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={applyMut.isPending || pendingFiltered.length === 0 || fineEmpFilter !== "all"}
              title={fineEmpFilter !== "all" ? "Hammasi bo'yicha qo'shish uchun 'Barcha xodimlar'ni tanlang" : ""}
              onClick={() => {
                if (!confirm(`${pendingFiltered.length} ta jarima qo'shilsinmi? Har biri 20 000 so'm.`)) return;
                applyMut.mutate();
              }}
            >
              {applyMut.isPending ? "Qo'shilmoqda..." : "Barchasini qo'shish"}
            </Button>
          </div>
          {filteredMissing.length > 0 && (
            <div className="max-h-80 overflow-y-auto rounded border bg-background">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="text-left px-3 py-2">Ishchi</th>
                    <th className="text-left px-3 py-2">Sana</th>
                    <th className="text-right px-3 py-2">Holat</th>
                    <th className="text-right px-3 py-2 w-32">Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMissing.map((m, i) => {
                    const rowKey = `${m.employee_id}-${m.date}`;
                    const isBusy = confirmingRow === rowKey;
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5">{m.employee_name}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{m.date}</td>
                        <td className="px-3 py-1.5 text-right">
                          {m.already_fined
                            ? <Badge variant="secondary">Jarima qo'yilgan</Badge>
                            : <Badge variant="destructive">Kutilmoqda</Badge>}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {!m.already_fined && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={isBusy}
                              onClick={() => {
                                setConfirmingRow(rowKey);
                                confirmRowMut.mutate(
                                  { employeeId: m.employee_id, date: m.date },
                                  { onSettled: () => setConfirmingRow(null) },
                                );
                              }}
                            >
                              {isBusy ? "..." : "Tasdiqlash"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredMissing.length === 0 && (
            <div className="text-sm text-muted-foreground">Bu oyda hisobotsiz kun aniqlanmadi 🎉</div>
          )}
        </Card>
        );
      })()}

      {isAdmin && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <div className="font-medium text-sm md:text-base">Hisobot yozishi kerak bo'lgan xodimlar</div>
              <div className="text-xs text-muted-foreground">Faqat belgilangan xodimlar uchun avtomatik jarima hisoblanadi</div>
            </div>
            <Badge variant="outline">
              {employees.filter(e => !e.terminated_at && e.report_required !== false).length} / {employees.filter(e => !e.terminated_at).length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {employees.filter(e => !e.terminated_at).map((e) => {
              const required = e.report_required !== false;
              return (
                <label key={e.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 cursor-pointer hover:bg-accent/50">
                  <span className="text-sm truncate">{e.full_name}</span>
                  <Switch
                    checked={required}
                    disabled={setRequiredMut.isPending}
                    onCheckedChange={(v) => setRequiredMut.mutate({ employeeId: e.id, required: v })}
                  />
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="font-medium text-sm md:text-base">Qo'lda jarima qo'shish</div>
            <Dialog open={fineOpen} onOpenChange={setFineOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Jarima qo'shish</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Yangi jarima</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Xodim</label>
                    <Select value={mfEmp} onValueChange={setMfEmp}>
                      <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                      <SelectContent>
                        {employees.filter(e => !e.terminated_at).map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Sana</label>
                      <Input type="date" value={mfDate} onChange={(e) => setMfDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Summa (so'm)</label>
                      <Input type="number" value={mfAmount} onChange={(e) => setMfAmount(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Sabab</label>
                    <Input placeholder="Masalan: Hisobot yozmagan" value={mfReason} onChange={(e) => setMfReason(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Izoh (ixtiyoriy)</label>
                    <Input value={mfNote} onChange={(e) => setMfNote(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFineOpen(false)}>Bekor qilish</Button>
                  <Button
                    disabled={!mfEmp || !mfDate || Number(mfAmount) <= 0 || addFineMut.isPending}
                    onClick={() => addFineMut.mutate()}
                  >
                    {addFineMut.isPending ? "Saqlanmoqda..." : "Saqlash"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="text-xs text-muted-foreground">Har bir xodim uchun alohida sabab bilan jarima qo'shishingiz mumkin. Jarima Jarima → Tarix bo'limida ko'rinadi va oylikdan avtomat ushlanadi.</div>
        </Card>
      )}





      {reports.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Hisobotlar yo'q. Ishchilar Telegram bot orqali "📋 Bajarilgan ishlar" tugmasini bossin.
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-col md:flex-row md:items-start gap-3 justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-semibold truncate">{empMap[r.employee_id] ?? "—"}</span>
                    <Badge variant="outline" className="font-mono text-xs">{r.date}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("uz-UZ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">{r.content}</div>
                </div>
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => handleDelete(r.id)} className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
