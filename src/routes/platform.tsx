import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Plus, Trash2, Users, FileText } from "lucide-react";
import {
  listTenants,
  listPlans,
  createTenant,
  updateTenant,
  setTenantSubscription,
  deleteTenant,
} from "@/lib/platform.functions";
import { useTenant } from "@/hooks/use-tenant";
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
                  <TableCell className="text-right">
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
    </div>
  );
}
