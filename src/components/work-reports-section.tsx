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
import { syncMissingReportFines } from "@/lib/jarima.functions";

type WorkReport = {
  id: string;
  employee_id: string;
  telegram_id: number | null;
  date: string;
  content: string;
  created_at: string;
};
type Employee = { id: string; full_name: string; terminated_at: string | null };

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
    queryKey: ["employees-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, terminated_at")
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
