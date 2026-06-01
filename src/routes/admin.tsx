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
  resetUserPassword,
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
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { useT, localeOf, type I18nKey } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin Panel" }] }),
});

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t, lang } = useT();

  const fetchUsers = useServerFn(listUsers);
  const setRoleFn = useServerFn(setUserRole);
  const deleteFn = useServerFn(deleteUser);
  const createFn = useServerFn(createUser);
  const setWidgetsFn = useServerFn(setUserWidgets);
  const resetPwFn = useServerFn(resetUserPassword);

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
      toast.success(t("admin.toast.updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(t("admin.toast.deleted"));
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
      toast.success(t("admin.toast.created"));
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
      toast.success(t("admin.toast.permsSaved"));
      setEditUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reset-password dialog state
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [pwValue, setPwValue] = useState("");

  const pwMut = useMutation({
    mutationFn: () =>
      resetPwFn({ data: { userId: pwUser!.id, password: pwValue } }),
    onSuccess: () => {
      toast.success(t("admin.toast.pwUpdated"));
      setPwUser(null);
      setPwValue("");
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
              <h1 className="text-xl font-bold tracking-tight">{t("admin.title")}</h1>
              <p className="text-xs text-muted-foreground">
                {t("admin.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> {t("admin.dashboard")}
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
              <LogOut className="h-4 w-4 mr-1" /> {t("common.logout")}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> {t("admin.newUser")}
          </Button>
        </div>

        <Card className="p-4">
          {isAccessError ? (
            <p className="text-destructive text-sm">
              {t("admin.adminOnly")}
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : error ? (
            <p className="text-destructive text-sm">
              {t("common.error")}: {(error as Error).message}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.col.email")}</TableHead>
                  <TableHead>{t("admin.col.name")}</TableHead>
                  <TableHead>{t("admin.col.permissions")}</TableHead>
                  <TableHead>{t("admin.col.lastLogin")}</TableHead>
                  <TableHead>{t("admin.col.admin")}</TableHead>
                  <TableHead className="text-right">{t("common.action")}</TableHead>
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
                        {isSelf && <Badge variant="outline">{t("common.you")}</Badge>}
                      </TableCell>
                      <TableCell>{u.display_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {isAdmin ? (
                          <Badge>{t("admin.allAdmin")}</Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {u.widgets.length} / {WIDGETS.length} {t("admin.sections")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleString(localeOf(lang))
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
                                ? t("admin.adminSeesAll")
                                : t("admin.editPermissions")
                            }
                            onClick={() => openEdit(u)}
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t("admin.resetPassword")}
                            onClick={() => {
                              setPwUser(u);
                              setPwValue("");
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf || delMut.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  t("admin.confirmDelete", { email: u.email ?? "" }),
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
            <DialogTitle>{t("admin.create.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.create.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("admin.email")}</Label>
              <Input
                type="email"
                value={nEmail}
                onChange={(e) => setNEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.name")}</Label>
              <Input
                value={nName}
                onChange={(e) => setNName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.password")}</Label>
              <Input
                type="text"
                value={nPass}
                onChange={(e) => setNPass(e.target.value)}
              />
            </div>
            <div className="space-y-2 pt-2">
              <Label>{t("admin.viewPerms")}</Label>
              <GroupedWidgetPicker value={nWidgets} onChange={setNWidgets} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                createMut.isPending ||
                !nEmail.trim() ||
                nPass.length < 6
              }
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "..." : t("common.create")}
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
            <DialogTitle>{t("admin.edit.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.edit.desc", { email: editUser?.email ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <GroupedWidgetPicker value={editWidgets} onChange={setEditWidgets} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={widgetsMut.isPending}
              onClick={() => widgetsMut.mutate()}
            >
              {widgetsMut.isPending ? "..." : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.pw.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.pw.desc", { email: pwUser?.email ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{t("admin.pw.newPassword")}</Label>
            <Input
              type="text"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              placeholder="Masalan: Visa2026!"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => pwMut.mutate()}
              disabled={pwValue.length < 6 || pwMut.isPending}
            >
              {pwMut.isPending ? "..." : t("common.update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupedWidgetPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useT();
  const set = (next: string[]) => onChange(Array.from(new Set(next)));
  const toggleOne = (key: string, on: boolean) =>
    set(on ? [...value, key] : value.filter((k) => k !== key));

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="text-xs underline text-muted-foreground"
          onClick={() => set(WIDGETS.map((w) => w.key))}
        >
          {t("common.all")}
        </button>
        <button
          type="button"
          className="text-xs underline text-muted-foreground"
          onClick={() => onChange([])}
        >
          {t("admin.none")}
        </button>
      </div>
      {WIDGET_GROUPS.map((g) => {
        const groupWidgets = WIDGETS.filter((w) => w.group === g.key);
        const groupKeys: string[] = groupWidgets.map((w) => w.key);
        const allOn = groupKeys.every((k) => value.includes(k));
        const someOn = groupKeys.some((k) => value.includes(k));
        return (
          <div key={g.key} className="border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-secondary/40 border-b">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allOn ? true : someOn ? "indeterminate" : false}
                  onCheckedChange={(v) =>
                    set(
                      v
                        ? [...value, ...groupKeys]
                        : value.filter((k) => !groupKeys.includes(k)),
                    )
                  }
                />
                <span className="text-sm font-semibold">{t(`wg.${g.key}` as I18nKey)}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {groupKeys.filter((k) => value.includes(k)).length} / {groupKeys.length}
              </span>
            </div>
            <div className="divide-y">
              {groupWidgets.map((w) => (
                <label
                  key={w.key}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/40"
                >
                  <Checkbox
                    checked={value.includes(w.key)}
                    onCheckedChange={(v) => toggleOne(w.key, !!v)}
                  />
                  <span className="text-sm">{t(`w.${w.key}` as I18nKey)}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
