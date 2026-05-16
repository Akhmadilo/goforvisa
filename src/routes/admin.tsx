import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listUsers, setUserRole, deleteUser } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, LogOut, Shield, Trash2 } from "lucide-react";
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

  const isAccessError =
    error && /Ruxsat|admin/i.test((error as Error).message);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-[1200px] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Admin Panel</h1>
              <p className="text-xs text-muted-foreground">
                Foydalanuvchilarni boshqarish
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

      <main className="mx-auto max-w-[1200px] px-6 py-6">
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
                  <TableHead>Ro'yxatdan o'tgan</TableHead>
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
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("uz-UZ")}
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>
    </div>
  );
}
