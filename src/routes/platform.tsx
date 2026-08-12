import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Plus, Trash2, Users, FileText, KeyRound, Tag } from "lucide-react";
import {
  listTenants,
  listPlans,
  createTenant,
  updateTenant,
  setTenantSubscription,
  deleteTenant,
  listTenantUsers,
  createTenantUser,
  setTenantUserPassword,
  deleteTenantUser,
  upsertPlan,
  deletePlan,
} from "@/lib/platform.functions";
import { useTenant } from "@/hooks/use-tenant";
import { TenantSettingsDialog } from "@/components/tenant-settings-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/platform")({
  component: PlatformPage,
  head: () => ({
    meta: [
      { title: "Platforma boshqaruvi — Kompaniyalar va obunalar" },
      {
        name: "description",
        content:
          "Platformadagi barcha kompaniyalarni, ularning foydalanuvchilari va obuna rejalarini boshqarish paneli.",
      },
      { property: "og:title", content: "Platforma boshqaruvi" },
      {
        property: "og:description",
        content: "Kompaniyalar, obunalar va tarif rejalarini boshqarish paneli.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_LABEL: Record<string, string> = {
  trialing: "Sinov muddati",
  active: "Faol",
  past_due: "To'lov kechikkan",
  canceled: "Bekor qilingan",
};

function money(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
}

function PlatformPage() {
  const { isPlatformAdmin, loading: tenantLoading } = useTenant();
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listTenants);
  const fetchPlans = useServerFn(listPlans);
  const create = useServerFn(createTenant);
  const update = useServerFn(updateTenant);
  const setSub = useServerFn(setTenantSubscription);
  const remove = useServerFn(deleteTenant);

  const tenantsQ = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => fetchTenants(),
    enabled: isPlatformAdmin,
  });
  const plansQ = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => fetchPlans(),
    enabled: isPlatformAdmin,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    contactEmail: "",
    contactPhone: "",
    planId: "",
    trialDays: 14,
    adminEmail: "",
    adminPassword: "",
    adminName: "",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["platform-tenants"] });

  const createM = useMutation({
    mutationFn: (v: typeof form) => create({ data: v }),
    onSuccess: () => {
      toast.success("Kompaniya yaratildi");
      setOpen(false);
      setForm({
        name: "",
        slug: "",
        contactEmail: "",
        contactPhone: "",
        planId: "",
        trialDays: 14,
        adminEmail: "",
        adminPassword: "",
        adminName: "",
      });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });

  const updateM = useMutation({
    mutationFn: (v: { tenantId: string; isActive?: boolean }) => update({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });

  const subM = useMutation({
    mutationFn: (v: {
      tenantId: string;
      planId: string | null;
      status: "trialing" | "active" | "past_due" | "canceled";
      periodEnd: string | null;
    }) => setSub({ data: v }),
    onSuccess: () => {
      toast.success("Obuna yangilandi");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });

  const deleteM = useMutation({
    mutationFn: (tenantId: string) => remove({ data: { tenantId } }),
    onSuccess: () => {
      toast.success("Kompaniya o'chirildi");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });

  const tenants = tenantsQ.data ?? [];
  const plans = (plansQ.data ?? []) as any[];

  const totals = useMemo(() => {
    const mrr = tenants.reduce(
      (s, t) => s + (t.subscription?.status === "active" ? t.subscription.price_uzs : 0),
      0,
    );
    return {
      count: tenants.length,
      active: tenants.filter((t) => t.subscription?.status === "active").length,
      trial: tenants.filter((t) => t.subscription?.status === "trialing").length,
      mrr,
    };
  }, [tenants]);

  if (tenantLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Yuklanmoqda...</div>;
  }
  if (!isPlatformAdmin) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <h1 className="text-lg font-semibold mb-1">Ruxsat yo'q</h1>
          <p className="text-sm text-muted-foreground">
            Bu bo'lim faqat platforma egasi uchun.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Platforma boshqaruvi
          </h1>
          <p className="text-sm text-muted-foreground">
            Kompaniyalar, foydalanuvchilar va obuna rejalari
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Yangi kompaniya
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Yangi kompaniya qo'shish</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Kompaniya nomi</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((f) => ({
                        ...f,
                        name,
                        slug: f.slug
                          ? f.slug
                          : name
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/^-|-$/g, ""),
                      }));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Qisqa nom (slug)</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Aloqa email</Label>
                  <Input
                    value={form.contactEmail}
                    onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefon</Label>
                  <Input
                    value={form.contactPhone}
                    onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tarif reja</Label>
                  <Select
                    value={form.planId}
                    onValueChange={(v) => setForm((f) => ({ ...f, planId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {money(Number(p.price_uzs))} so'm
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Sinov kunlari</Label>
                  <Input
                    type="number"
                    value={form.trialDays}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, trialDays: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>

              <div className="border-t border-border pt-3 mt-1">
                <div className="text-sm font-medium mb-2">Kompaniya admini</div>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label>Ism</Label>
                    <Input
                      value={form.adminName}
                      onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={form.adminEmail}
                        onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Parol</Label>
                      <Input
                        value={form.adminPassword}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, adminPassword: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createM.mutate(form)}
                disabled={
                  createM.isPending ||
                  !form.name ||
                  !form.slug ||
                  !form.adminEmail ||
                  form.adminPassword.length < 6 ||
                  !form.adminName
                }
              >
                {createM.isPending ? "Yaratilmoqda..." : "Yaratish"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Kompaniyalar</div>
          <div className="text-2xl font-bold">{totals.count}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Faol obunalar</div>
          <div className="text-2xl font-bold text-emerald-500">{totals.active}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Sinovda</div>
          <div className="text-2xl font-bold text-amber-500">{totals.trial}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Oylik daromad (MRR)</div>
          <div className="text-2xl font-bold">{money(totals.mrr)} so'm</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kompaniya</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead>Reja</TableHead>
                <TableHead>Obuna</TableHead>
                <TableHead>Tugash sanasi</TableHead>
                <TableHead className="text-right">Foydalanuvchi</TableHead>
                <TableHead className="text-right">Shartnoma</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenantsQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Yuklanmoqda...
                  </TableCell>
                </TableRow>
              )}
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.slug}
                      {t.contact_email ? ` · ${t.contact_email}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={t.is_active ? "secondary" : "outline"}
                      onClick={() =>
                        updateM.mutate({ tenantId: t.id, isActive: !t.is_active })
                      }
                    >
                      {t.is_active ? "Faol" : "O'chirilgan"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={plans.find((p) => p.code === t.subscription?.plan_code)?.id ?? ""}
                      onValueChange={(v) =>
                        subM.mutate({
                          tenantId: t.id,
                          planId: v,
                          status: (t.subscription?.status as any) ?? "trialing",
                          periodEnd: t.subscription?.current_period_end ?? null,
                        })
                      }
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.subscription?.status ?? "trialing"}
                      onValueChange={(v) =>
                        subM.mutate({
                          tenantId: t.id,
                          planId:
                            plans.find((p) => p.code === t.subscription?.plan_code)?.id ?? null,
                          status: v as any,
                          periodEnd: t.subscription?.current_period_end ?? null,
                        })
                      }
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="w-[150px]"
                      defaultValue={t.subscription?.current_period_end ?? ""}
                      onBlur={(e) =>
                        subM.mutate({
                          tenantId: t.id,
                          planId:
                            plans.find((p) => p.code === t.subscription?.plan_code)?.id ?? null,
                          status: (t.subscription?.status as any) ?? "trialing",
                          periodEnd: e.target.value || null,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      {t.users_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="gap-1">
                      <FileText className="h-3 w-3" />
                      {t.contracts_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <TenantUsersDialog tenantId={t.id} tenantName={t.name} />
                    <TenantSettingsDialog tenantId={t.id} tenantName={t.name} />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (
                          confirm(
                            `"${t.name}" kompaniyasi va uning BARCHA ma'lumotlari o'chiriladi. Davom etasizmi?`,
                          )
                        )
                          deleteM.mutate(t.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <PlansCard />
    </div>
  );
}

/* ---------------- Tarif rejalar (narxlar) ---------------- */

function PlansCard() {
  const qc = useQueryClient();
  const fetchPlans = useServerFn(listPlans);
  const save = useServerFn(upsertPlan);
  const remove = useServerFn(deletePlan);

  const plansQ = useQuery({ queryKey: ["platform-plans"], queryFn: () => fetchPlans() });
  const plans = (plansQ.data ?? []) as any[];

  const [draft, setDraft] = useState<Record<string, { name: string; price: string }>>({});
  const [nw, setNw] = useState({ code: "", name: "", price: "" });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["platform-plans"] });
    qc.invalidateQueries({ queryKey: ["platform-tenants"] });
  };

  const saveM = useMutation({
    mutationFn: (v: any) => save({ data: v }),
    onSuccess: () => {
      toast.success("Saqlandi");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });
  const delM = useMutation({
    mutationFn: (planId: string) => remove({ data: { planId } }),
    onSuccess: () => {
      toast.success("O'chirildi");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Tarif rejalar va narxlar</h2>
      </div>

      <div className="space-y-2">
        {plans.map((p) => {
          const d = draft[p.id] ?? { name: p.name, price: String(p.price_uzs ?? 0) };
          return (
            <div key={p.id} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Kod</Label>
                <Input className="w-[130px]" value={p.code} readOnly />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nomi</Label>
                <Input
                  className="w-[180px]"
                  value={d.name}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, [p.id]: { ...d, name: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Narx (so'm / oy)</Label>
                <Input
                  className="w-[170px]"
                  type="number"
                  value={d.price}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, [p.id]: { ...d, price: e.target.value } }))
                  }
                />
              </div>
              <Button
                size="sm"
                onClick={() =>
                  saveM.mutate({
                    id: p.id,
                    code: p.code,
                    name: d.name,
                    priceUzs: Number(d.price) || 0,
                    interval: p.interval ?? "month",
                    maxUsers: p.max_users ?? null,
                    isActive: p.is_active ?? true,
                  })
                }
              >
                Saqlash
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (confirm(`"${p.name}" rejasi o'chirilsinmi?`)) delM.mutate(p.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Yangi kod</Label>
          <Input
            className="w-[130px]"
            value={nw.code}
            onChange={(e) => setNw((s) => ({ ...s, code: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nomi</Label>
          <Input
            className="w-[180px]"
            value={nw.name}
            onChange={(e) => setNw((s) => ({ ...s, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Narx (so'm / oy)</Label>
          <Input
            className="w-[170px]"
            type="number"
            value={nw.price}
            onChange={(e) => setNw((s) => ({ ...s, price: e.target.value }))}
          />
        </div>
        <Button
          variant="secondary"
          disabled={nw.code.length < 2 || nw.name.length < 2}
          onClick={() => {
            saveM.mutate({
              code: nw.code,
              name: nw.name,
              priceUzs: Number(nw.price) || 0,
              interval: "month",
              isActive: true,
            });
            setNw({ code: "", name: "", price: "" });
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Reja qo'shish
        </Button>
      </div>
    </Card>
  );
}

/* ---------------- Kompaniya foydalanuvchilari ---------------- */

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  owner_ceo: "Direktor / CEO",
  financier: "Moliyachi",
  user: "Xodim",
};

function TenantUsersDialog({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listTenantUsers);
  const addUser = useServerFn(createTenantUser);
  const setPass = useServerFn(setTenantUserPassword);
  const delUser = useServerFn(deleteTenantUser);

  const usersQ = useQuery({
    queryKey: ["tenant-users", tenantId],
    queryFn: () => fetchUsers({ data: { tenantId } }),
    enabled: open,
  });

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tenant-users", tenantId] });
    qc.invalidateQueries({ queryKey: ["platform-tenants"] });
  };

  const addM = useMutation({
    mutationFn: () => addUser({ data: { tenantId, ...form } as any }),
    onSuccess: () => {
      toast.success("Foydalanuvchi qo'shildi");
      setForm({ name: "", email: "", password: "", role: "user" });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });
  const passM = useMutation({
    mutationFn: (v: { userId: string; password: string }) => setPass({ data: v }),
    onSuccess: () => toast.success("Parol yangilandi"),
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });
  const delM = useMutation({
    mutationFn: (userId: string) => delUser({ data: { userId, tenantId } }),
    onSuccess: () => {
      toast.success("O'chirildi");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Xatolik"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Foydalanuvchilar">
          <Users className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tenantName} — foydalanuvchilar</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {usersQ.isLoading && (
            <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
          )}
          {(usersQ.data ?? []).map((u) => (
            <div
              key={u.user_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <div className="min-w-[180px]">
                <div className="text-sm font-medium">{u.display_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {u.is_owner && <Badge variant="secondary">Egasi</Badge>}
                {u.roles.map((r) => (
                  <Badge key={r} variant="outline">
                    {ROLE_LABEL[r] ?? r}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Parolni o'zgartirish"
                  onClick={() => {
                    const p = prompt("Yangi parol (kamida 6 belgi)");
                    if (p && p.length >= 6) passM.mutate({ userId: u.user_id, password: p });
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`${u.email} o'chirilsinmi?`)) delM.mutate(u.user_id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {!usersQ.isLoading && (usersQ.data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">Foydalanuvchi yo'q</div>
          )}
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <div className="text-sm font-medium">Yangi foydalanuvchi (kod/parol)</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ism</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email (login)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Parol</Label>
              <Input
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => addM.mutate()}
            disabled={
              addM.isPending || !form.name || !form.email || form.password.length < 6
            }
          >
            {addM.isPending ? "Qo'shilmoqda..." : "Qo'shish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
