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
  Users, LogOut, Shield, Search, Plus, Pencil, Trash2, Phone, Briefcase, Camera, UserCheck, UserX,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employees")({
  component: EmployeesPage,
  head: () => ({
    meta: [
      { title: "Ishchilar — GoForVisa" },
      { name: "description", content: "Kompaniya ishchilari ro'yxati va ma'lumotlari" },
    ],
  }),
});

type Employee = {
  id: string;
  full_name: string;
  phone: string | null;
  position: string | null;
  avatar_url: string | null;
  hired_at: string | null;
  terminated_at: string | null;
  note: string | null;
};

/** Resolve a stored avatar_url (storage path, or legacy public URL) to a usable signed URL. */
function useEmployeePhotoUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!stored) { setUrl(null); return; }
    // Extract path from legacy public URL if present
    const marker = "/employee-photos/";
    let path = stored;
    const i = stored.indexOf(marker);
    if (i >= 0) path = stored.slice(i + marker.length).split("?")[0];
    // If still looks like an absolute URL (different bucket / external), use as-is
    if (/^https?:\/\//i.test(path)) { setUrl(stored); return; }
    supabase.storage.from("employee-photos").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [stored]);
  return url;
}

function EmployeesPage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);
  useEffect(() => {
    if (!loading && !permsLoading && user && !can("employees_section")) navigate({ to: "/" });
  }, [loading, permsLoading, user, can, navigate]);

  const canEdit = can("employees_create");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"active" | "terminated" | "all">("active");

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("employees-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        qc.invalidateQueries({ queryKey: ["employees"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (filter === "active" && e.terminated_at) return false;
      if (filter === "terminated" && !e.terminated_at) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          e.full_name.toLowerCase().includes(q) ||
          (e.phone ?? "").toLowerCase().includes(q) ||
          (e.position ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [employees, filter, query]);

  const stats = useMemo(() => {
    const active = employees.filter((e) => !e.terminated_at).length;
    const terminated = employees.length - active;
    return { active, terminated, total: employees.length };
  }, [employees]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Ishchini o'chirishni xohlaysizmi?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("O'chirildi");
  };

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
                <Users className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Ishchilar</h1>
                <p className="text-xs text-muted-foreground">Kompaniya jamoasi</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button
                  onClick={() => { setEditing(null); setFormOpen(true); }}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Ishchi qo'shish</span>
                </Button>
              )}
              {isAdmin && (
                <Link to="/admin" className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center" title="Admin">
                  <Shield className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
                className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center"
                title="Chiqish"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-6 py-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami ishchilar</div>
              <div className="mt-1 text-2xl font-bold">{stats.total}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Faol</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Ishdan ketgan</div>
              <div className="mt-1 text-2xl font-bold text-muted-foreground">{stats.terminated}</div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ism, telefon yoki lavozim..."
                  className="pl-8"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-1.5">
                {([
                  ["active", "Faol"],
                  ["terminated", "Ketganlar"],
                  ["all", "Barchasi"],
                ] as const).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-md border transition-colors",
                      filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              Ishchilar topilmadi.
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((e) => (
                <EmployeeCard
                  key={e.id}
                  emp={e}
                  canEdit={canEdit}
                  onEdit={() => { setEditing(e); setFormOpen(true); }}
                  onDelete={() => handleDelete(e.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        employee={editing}
      />
    </div>
  );
}

function EmployeeCard({
  emp, canEdit, onEdit, onDelete,
}: {
  emp: Employee;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const initials = emp.full_name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  const terminated = !!emp.terminated_at;
  const photoUrl = useEmployeePhotoUrl(emp.avatar_url);

  return (
    <Card className={cn("p-4 space-y-3 transition-shadow hover:shadow-lg", terminated && "opacity-70")}>
      <div className="flex items-start gap-3">
        <div className="relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={emp.full_name}
              className="h-16 w-16 rounded-full object-cover border-2 border-border"
            />
          ) : (
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center text-lg font-bold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              {initials || "?"}
            </div>
          )}
          {terminated && (
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-muted border-2 border-card flex items-center justify-center">
              <UserX className="h-3 w-3" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{emp.full_name}</div>
          {emp.position && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Briefcase className="h-3 w-3 shrink-0" /> <span className="truncate">{emp.position}</span>
            </div>
          )}
          {emp.phone && (
            <a href={`tel:${emp.phone}`} className="text-xs text-primary flex items-center gap-1 mt-0.5 hover:underline">
              <Phone className="h-3 w-3 shrink-0" /> {emp.phone}
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <Badge
          variant="outline"
          className={cn(
            "border gap-1",
            terminated
              ? "bg-muted text-muted-foreground border-muted-foreground/30"
              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          )}
        >
          {terminated ? <><UserX className="h-3 w-3" /> Ishdan ketgan</> : <><UserCheck className="h-3 w-3" /> Faol</>}
        </Badge>
        {emp.hired_at && (
          <span className="text-muted-foreground">{emp.hired_at}{terminated && emp.terminated_at ? ` → ${emp.terminated_at}` : ""}</span>
        )}
      </div>

      {emp.note && (
        <div className="text-xs text-muted-foreground border-t border-border pt-2 line-clamp-2">{emp.note}</div>
      )}

      {canEdit && (
        <div className="flex gap-1.5 pt-1">
          <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={onEdit}>
            <Pencil className="h-3 w-3" /> Tahrirlash
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
            onClick={onDelete}
            title="O'chirish"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </Card>
  );
}

function EmployeeFormDialog({
  open, onOpenChange, employee,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: Employee | null;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hiredAt, setHiredAt] = useState("");
  const [terminated, setTerminated] = useState(false);
  const [terminatedAt, setTerminatedAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName(employee?.full_name ?? "");
      setPhone(employee?.phone ?? "");
      setPosition(employee?.position ?? "");
      setAvatarUrl(employee?.avatar_url ?? null);
      setHiredAt(employee?.hired_at ?? "");
      setTerminated(!!employee?.terminated_at);
      setTerminatedAt(employee?.terminated_at ?? new Date().toISOString().slice(0, 10));
      setNote(employee?.note ?? "");
    }
  }, [open, employee]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("employee-photos").upload(path, file, {
      cacheControl: "3600", upsert: false,
    });
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    // Bucket is private — store the storage path; display uses signed URLs.
    setAvatarUrl(path);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!fullName.trim()) { toast.error("Ism kiritilmagan"); return; }
    setSaving(true);
    const payload = {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      position: position.trim() || null,
      avatar_url: avatarUrl,
      hired_at: hiredAt || null,
      terminated_at: terminated ? (terminatedAt || new Date().toISOString().slice(0, 10)) : null,
      note: note.trim() || null,
    };
    const { error } = employee
      ? await supabase.from("employees").update(payload).eq("id", employee.id)
      : await supabase.from("employees").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(employee ? "Yangilandi" : "Qo'shildi");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? "Ishchini tahrirlash" : "Yangi ishchi"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <DialogAvatarPreview stored={avatarUrl} />
            ) : null}
            {!avatarUrl && (
              <div className="h-20 w-20 rounded-full bg-muted border-2 border-border flex items-center justify-center">
                <Camera className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1">
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-input hover:bg-secondary">
                <Camera className="h-4 w-4" />
                {uploading ? "Yuklanmoqda..." : avatarUrl ? "Rasmni o'zgartirish" : "Rasm yuklash"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                />
              </label>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl(null)}
                  className="text-xs text-destructive hover:underline mt-1.5 block"
                >
                  Rasmni olib tashlash
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">To'liq ism *</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Telefon</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Lavozim</label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ishga olingan sana</label>
            <Input type="date" value={hiredAt} onChange={(e) => setHiredAt(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="text-sm">
              <div className="font-medium">Ishdan ketgan</div>
              <div className="text-xs text-muted-foreground">Belgilang agar ishchi ketgan bo'lsa</div>
            </div>
            <Switch checked={terminated} onCheckedChange={setTerminated} />
          </div>
          {terminated && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ketgan sana</label>
              <Input type="date" value={terminatedAt} onChange={(e) => setTerminatedAt(e.target.value)} />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Izoh</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button
            onClick={handleSave}
            disabled={saving || uploading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
