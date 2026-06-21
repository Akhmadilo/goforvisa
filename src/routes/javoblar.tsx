import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, LogOut, Shield, Plus, Check, X, Clock, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/javoblar")({
  component: LeavesPage,
  head: () => ({
    meta: [
      { title: "Dam olish so'rovlari — GoForVisa" },
      { name: "description", content: "Ishchilarning dam olish so'rovlari va tasdiqlash" },
    ],
  }),
});

type LeaveStatus = "pending" | "approved" | "rejected";
type Leave = {
  id: string;
  employee_id: string;
  date: string;
  reason: string | null;
  status: LeaveStatus;
  salary_counts: boolean | null;
  fine_amount_uzs: number;
  note: string | null;
  created_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};
type Employee = { id: string; full_name: string; terminated_at: string | null };

function fmtMoney(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
}

function LeavesPage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);

  // Check if user is admin OR financier
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

  useEffect(() => {
    if (!loading && user && myRoles.length > 0 && !canAccess) navigate({ to: "/" });
  }, [loading, user, myRoles, canAccess, navigate]);

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

  const { data: leaves = [] } = useQuery({
    queryKey: ["leave_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .order("date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Leave[];
    },
    enabled: !!user && canAccess,
  });

  useEffect(() => {
    if (!user || !canAccess) return;
    const ch = supabase
      .channel("leaves-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["leave_requests"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, canAccess, qc]);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.full_name])), [employees]);

  const [formOpen, setFormOpen] = useState(false);
  const [decideOpen, setDecideOpen] = useState<Leave | null>(null);
  const [filter, setFilter] = useState<"all" | LeaveStatus>("pending");

  const filtered = useMemo(
    () => leaves.filter((l) => filter === "all" || l.status === filter),
    [leaves, filter],
  );

  const counts = useMemo(() => ({
    pending: leaves.filter((l) => l.status === "pending").length,
    approved: leaves.filter((l) => l.status === "approved").length,
    rejected: leaves.filter((l) => l.status === "rejected").length,
  }), [leaves]);

  const handleDelete = async (id: string) => {
    if (!confirm("So'rovni o'chirishni tasdiqlaysizmi?")) return;
    const { error } = await supabase.from("leave_requests").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("O'chirildi");
  };

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Ruxsat yo'q
      </div>
    );
  }

  const filterChips = [
    { key: "pending" as const, label: `Kutilmoqda (${counts.pending})` },
    { key: "approved" as const, label: `Tasdiqlangan (${counts.approved})` },
    { key: "rejected" as const, label: `Rad etilgan (${counts.rejected})` },
    { key: "all" as const, label: "Barchasi" },
  ];

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="relative z-10 md:pl-56">
        <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-[1500px] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ background: "var(--gradient-primary)" }}
              >
                <CalendarDays className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Dam olish so'rovlari</h1>
                <p className="text-xs text-muted-foreground">Ishchilarning javob so'rovlari va tasdiqlash</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setFormOpen(true)}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Yangi so'rov</span>
              </Button>
              {isAdmin && (
                <Link to="/admin" className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center" title="Admin">
                  <Shield className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
                className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-6 py-6 space-y-6">
          <Card className="p-4">
            <div className="flex gap-1.5 flex-wrap">
              {filterChips.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    filter === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">So'rovlar yo'q</Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((l) => (
                <Card key={l.id} className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{empMap[l.employee_id] ?? "—"}</span>
                        <Badge variant="outline" className="font-mono text-xs">{l.date}</Badge>
                        <StatusBadge status={l.status} />
                        {l.status === "approved" && (
                          <Badge variant="outline" className={l.salary_counts
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                          }>
                            {l.salary_counts ? "Oylik hisoblanadi" : "Oylik hisoblanmaydi"}
                          </Badge>
                        )}
                        {l.status === "approved" && l.salary_counts && l.fine_amount_uzs > 0 && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30">
                            Jarima: {fmtMoney(l.fine_amount_uzs)} so'm
                          </Badge>
                        )}
                      </div>
                      {l.reason && <div className="text-sm text-muted-foreground mt-1">Sabab: {l.reason}</div>}
                      {l.note && <div className="text-xs text-muted-foreground mt-0.5">Izoh: {l.note}</div>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {l.status === "pending" && isAdmin && (
                        <Button size="sm" onClick={() => setDecideOpen(l)} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                          <Check className="h-3.5 w-3.5" /> Ko'rib chiqish
                        </Button>
                      )}
                      {l.status === "pending" && !isAdmin && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Direktor tasdiqlashi kutilmoqda
                        </span>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => handleDelete(l.id)} className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      <LeaveFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        employees={employees.filter((e) => !e.terminated_at)}
        userId={user?.id ?? null}
      />
      <DecideDialog
        leave={decideOpen}
        onOpenChange={(o) => { if (!o) setDecideOpen(null); }}
        userId={user?.id ?? null}
        empName={decideOpen ? (empMap[decideOpen.employee_id] ?? "—") : ""}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: LeaveStatus }) {
  if (status === "pending")
    return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30 gap-1"><Clock className="h-3 w-3" /> Kutilmoqda</Badge>;
  if (status === "approved")
    return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1"><Check className="h-3 w-3" /> Tasdiqlangan</Badge>;
  return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30 gap-1"><X className="h-3 w-3" /> Rad etilgan</Badge>;
}

function LeaveFormDialog({
  open, onOpenChange, employees, userId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employees: Employee[];
  userId: string | null;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployeeId("");
      setDate(new Date().toISOString().slice(0, 10));
      setReason("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!employeeId) { toast.error("Ishchini tanlang"); return; }
    setSaving(true);
    const { error } = await supabase.from("leave_requests").insert({
      employee_id: employeeId,
      date,
      reason: reason.trim() || null,
      status: "pending",
      created_by: userId,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("So'rov yaratildi — direktor tasdiqlashi kutilmoqda");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Yangi dam olish so'rovi</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ishchi *</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Tanlang" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Sana *</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Sabab</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Nima uchun dam olish kerak..." />
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
            So'rov "Kutilmoqda" holatida saqlanadi. Direktor tasdiqlaganda oylik hisoblansin yoki yo'qligini va jarima miqdorini belgilaydi.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saqlanmoqda..." : "Yuborish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecideDialog({
  leave, onOpenChange, userId, empName,
}: {
  leave: Leave | null;
  onOpenChange: (o: boolean) => void;
  userId: string | null;
  empName: string;
}) {
  const [salaryCounts, setSalaryCounts] = useState(true);
  const [fineStr, setFineStr] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (leave) {
      setSalaryCounts(true);
      setFineStr("");
      setNote("");
    }
  }, [leave]);

  if (!leave) return null;

  const decide = async (status: "approved" | "rejected") => {
    setSaving(true);
    const fine = Number((fineStr || "").replace(/[^0-9]/g, "")) || 0;
    const { error } = await supabase
      .from("leave_requests")
      .update({
        status,
        salary_counts: status === "approved" ? salaryCounts : null,
        fine_amount_uzs: status === "approved" && salaryCounts ? fine : 0,
        note: note.trim() || null,
        decided_by: userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", leave.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? "Tasdiqlandi" : "Rad etildi");
    onOpenChange(false);
  };

  return (
    <Dialog open={!!leave} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>So'rovni ko'rib chiqish</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border p-3 bg-muted/30 text-sm space-y-1">
            <div><span className="text-muted-foreground">Ishchi:</span> <span className="font-medium">{empName}</span></div>
            <div><span className="text-muted-foreground">Sana:</span> <span className="font-mono">{leave.date}</span></div>
            {leave.reason && <div><span className="text-muted-foreground">Sabab:</span> {leave.reason}</div>}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="text-sm">
              <div className="font-medium">Oylik hisoblansinmi?</div>
              <div className="text-xs text-muted-foreground">
                {salaryCounts ? "Ha — bu kun ish kuni sifatida hisoblanadi" : "Yo'q — bu kun uchun oylik hisoblanmaydi"}
              </div>
            </div>
            <Switch checked={salaryCounts} onCheckedChange={setSalaryCounts} />
          </div>

          {salaryCounts && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Jarima summasi (so'mda, ixtiyoriy)</label>
              <Input
                type="text"
                inputMode="numeric"
                value={fineStr}
                onChange={(e) => setFineStr(e.target.value)}
                placeholder="Masalan: 120 000"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Bo'sh qoldirilsa jarima qo'llanilmaydi</p>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Direktor izohi</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => decide("rejected")} disabled={saving} className="gap-1">
            <X className="h-4 w-4" /> Rad etish
          </Button>
          <Button onClick={() => decide("approved")} disabled={saving} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Check className="h-4 w-4" /> Tasdiqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
