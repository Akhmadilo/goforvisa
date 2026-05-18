import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listUsers,
  setUserRole,
  deleteUser,
  createUser,
  setUserWidgets,
  type AdminUser,
} from "@/lib/admin.functions";
import { WIDGETS, WIDGET_GROUPS, type WidgetGroup } from "@/lib/widgets";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  LogOut,
  Shield,
  Trash2,
  UserPlus,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin Panel" }] }),
});

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchUsers = useServerFn(listUsers);
  const setRoleFn = useServerFn(setUserRole);
  const deleteFn = useServerFn(deleteUser);
  const createFn = useServerFn(createUser);
  const setWidgetsFn = useServerFn(setUserWidgets);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "user"; enabled: boolean }) =>
      setRoleFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Yangilandi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("O'chirildi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Create-user dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [nEmail, setNEmail] = useState("");
  const [nName, setNName] = useState("");
  const [nPass, setNPass] = useState("");
  const [nWidgets, setNWidgets] = useState<string[]>(
    WIDGETS.map((w) => w.key),
  );

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          email: nEmail.trim(),
          password: nPass,
          displayName: nName.trim() || nEmail.trim(),
          widgets: nWidgets,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Foydalanuvchi yaratildi");
      setCreateOpen(false);
      setNEmail("");
      setNName("");
      setNPass("");
      setNWidgets(WIDGETS.map((w) => w.key));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Edit-widgets dialog state
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editWidgets, setEditWidgets] = useState<string[]>([]);

  const widgetsMut = useMutation({
    mutationFn: () =>
      setWidgetsFn({
        data: { userId: editUser!.id, widgets: editWidgets },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Ruxsatlar saqlandi");
      setEditUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAccessError =
    error && /Ruxsat|admin/i.test((error as Error).message);

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setEditWidgets(u.widgets);
  };

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    key: string,
    on: boolean,
  ) => {
    setList(on ? Array.from(new Set([...list, key])) : list.filter((k) => k !== key));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-[1200px] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Admin Panel</h1>
              <p className="text-xs text-muted-foreground">
                Foydalanuvchilarni va ruxsatlarni boshqarish
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="h-4 w-4 mr-1" /> Chiqish
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Yangi foydalanuvchi
          </Button>
        </div>

        <Card className="p-4">
          {isAccessError ? (
            <p className="text-destructive text-sm">
              Bu sahifaga faqat adminlar kira oladi.
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
          ) : error ? (
            <p className="text-destructive text-sm">
              Xatolik: {(error as Error).message}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Ism</TableHead>
                  <TableHead>Ruxsatlar</TableHead>
                  <TableHead>Oxirgi kirish</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead className="text-right">Amal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((u) => {
                  const isAdmin = u.roles.includes("admin");
                  const isSelf = u.id === user?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.email}{" "}
                        {isSelf && <Badge variant="outline">siz</Badge>}
                      </TableCell>
                      <TableCell>{u.display_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {isAdmin ? (
                          <Badge>hammasi (admin)</Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {u.widgets.length} / {WIDGETS.length} bo'lim
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleString("uz-UZ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={isAdmin}
                          disabled={isSelf || roleMut.isPending}
                          onCheckedChange={(v) =>
                            roleMut.mutate({
                              userId: u.id,
                              role: "admin",
                              enabled: v,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isAdmin}
                            title={
                              isAdmin
                                ? "Admin hamma narsani ko'radi"
                                : "Ruxsatlarni tahrirlash"
                            }
                            onClick={() => openEdit(u)}
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf || delMut.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `${u.email} foydalanuvchisini o'chirishni tasdiqlaysizmi?`,
                                )
                              ) {
                                delMut.mutate(u.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>

      {/* Create user dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yangi foydalanuvchi yaratish</DialogTitle>
            <DialogDescription>
              Foydalanuvchi ko'rishi mumkin bo'lgan bo'limlarni belgilang.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={nEmail}
                onChange={(e) => setNEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ism</Label>
              <Input
                value={nName}
                onChange={(e) => setNName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Parol (kamida 6 belgi)</Label>
              <Input
                type="text"
                value={nPass}
                onChange={(e) => setNPass(e.target.value)}
              />
            </div>
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <Label>Ko'rish ruxsatlari</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs underline text-muted-foreground"
                    onClick={() => setNWidgets(WIDGETS.map((w) => w.key))}
                  >
                    Hammasi
                  </button>
                  <button
                    type="button"
                    className="text-xs underline text-muted-foreground"
                    onClick={() => setNWidgets([])}
                  >
                    Hech biri
                  </button>
                </div>
              </div>
              <div className="border rounded-md divide-y">
                {WIDGETS.map((w) => (
                  <label
                    key={w.key}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/50"
                  >
                    <Checkbox
                      checked={nWidgets.includes(w.key)}
                      onCheckedChange={(v) =>
                        toggle(nWidgets, setNWidgets, w.key, !!v)
                      }
                    />
                    <span className="text-sm">{w.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Bekor qilish
            </Button>
            <Button
              disabled={
                createMut.isPending ||
                !nEmail.trim() ||
                nPass.length < 6
              }
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "..." : "Yaratish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit widgets dialog */}
      <Dialog
        open={!!editUser}
        onOpenChange={(o) => !o && setEditUser(null)}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ko'rish ruxsatlari</DialogTitle>
            <DialogDescription>
              {editUser?.email} — qaysi bo'limlarni ko'ra oladi?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-xs underline text-muted-foreground"
                onClick={() => setEditWidgets(WIDGETS.map((w) => w.key))}
              >
                Hammasi
              </button>
              <button
                type="button"
                className="text-xs underline text-muted-foreground"
                onClick={() => setEditWidgets([])}
              >
                Hech biri
              </button>
            </div>
            <div className="border rounded-md divide-y">
              {WIDGETS.map((w) => (
                <label
                  key={w.key}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/50"
                >
                  <Checkbox
                    checked={editWidgets.includes(w.key)}
                    onCheckedChange={(v) =>
                      toggle(editWidgets, setEditWidgets, w.key, !!v)
                    }
                  />
                  <span className="text-sm">{w.label}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              Bekor qilish
            </Button>
            <Button
              disabled={widgetsMut.isPending}
              onClick={() => widgetsMut.mutate()}
            >
              {widgetsMut.isPending ? "..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
