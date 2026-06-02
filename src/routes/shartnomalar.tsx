import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/app-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { useT, localeOf } from "@/lib/i18n";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/shartnomalar")({
  component: ShartnomalarPage,
});

type ContractRow = {
  id: string;
  year: string | null;
  month: string | null;
  client_name: string;
  contract_no: string | null;
  contract_date: string | null;
  price_uzs: number;
  price_usd: number;
  docs_usd: number;
  commission: number;
  payment: string | null;
  people: number;
  note: string | null;
  contract_type: string | null;
  phone: string | null;
  call_centre: string | null;
  sales_manager: string | null;
  back_office_manager: string | null;
  company: string | null;
  visa_result: string | null;
  kpi_sales: number;
  kpi_back_office: number;
  total: number;
  visa_fee: number;
  created_at: string;
};

type FormState = Omit<ContractRow, "id" | "created_at">;

const emptyForm: FormState = {
  year: new Date().getFullYear().toString(),
  month: "",
  client_name: "",
  contract_no: "",
  contract_date: new Date().toISOString().slice(0, 10),
  price_uzs: 0,
  price_usd: 0,
  docs_usd: 0,
  commission: 0,
  payment: "",
  people: 1,
  note: "",
  contract_type: "",
  phone: "",
  call_centre: "",
  sales_manager: "",
  back_office_manager: "",
  company: "",
  visa_result: "",
  kpi_sales: 0,
  kpi_back_office: 0,
  total: 0,
  visa_fee: 0,
};

function ShartnomalarPage() {
  const { user, loading: authLoading } = useAuth();
  const { can, loading: permLoading } = useWidgetPermissions();
  const navigate = Route.useNavigate();
  const { t, lang } = useT();
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!permLoading && user && !can("contracts_section")) {
      navigate({ to: "/" });
    }
  }, [permLoading, user, can, navigate]);

  const canCreate = can("contracts_create");
  const canEdit = can("contracts_edit");
  const canDelete = can("contracts_delete");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["contracts-db"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractRow[];
    },
  });

  const [search, setSearch] = useState("");
  const rows = data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      [
        c.client_name,
        c.contract_no,
        c.phone,
        c.sales_manager,
        c.back_office_manager,
        c.company,
        c.contract_type,
        c.visa_result,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const fmt = (n: number | null | undefined) =>
    n ? Number(n).toLocaleString(localeOf(lang), { maximumFractionDigits: 2 }) : "—";

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContractRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };
  const openEdit = (row: ContractRow) => {
    setEditing(row);
    const { id, created_at, ...rest } = row;
    void id;
    void created_at;
    setForm(rest);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.client_name.trim()) {
      toast.error("Mijoz ismi majburiy");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      contract_date: form.contract_date || null,
      year: form.year || null,
      month: form.month || null,
    };
    const res = editing
      ? await supabase.from("contracts").update(payload).eq("id", editing.id)
      : await supabase.from("contracts").insert(payload);
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(editing ? "Yangilandi" : "Qo'shildi");
    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["contracts-db"] });
  };

  const remove = async (row: ContractRow) => {
    if (!confirm(`O'chirilsinmi: ${row.client_name}?`)) return;
    const { error } = await supabase.from("contracts").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("O'chirildi");
    qc.invalidateQueries({ queryKey: ["contracts-db"] });
  };

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:pl-56">
        <div className="container mx-auto px-4 py-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">{t("nav.contracts")}</h1>
              <p className="text-sm text-muted-foreground">
                {rows.length} {t("common.records")}
                {isFetching ? ` · ${t("common.updating")}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("dash.search.placeholder")}
                  className="pl-8 w-64"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
              {canCreate && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4 mr-1" /> {t("common.add")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editing ? t("common.edit") : t("common.add")} — {t("nav.contracts")}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
                      <Field label="Mijoz ismi *">
                        <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
                      </Field>
                      <Field label="Shartnoma №">
                        <Input value={form.contract_no ?? ""} onChange={(e) => setForm({ ...form, contract_no: e.target.value })} />
                      </Field>
                      <Field label="Sana">
                        <Input type="date" value={form.contract_date ?? ""} onChange={(e) => setForm({ ...form, contract_date: e.target.value })} />
                      </Field>
                      <Field label="Telefon">
                        <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                      </Field>
                      <Field label="Yil">
                        <Input value={form.year ?? ""} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                      </Field>
                      <Field label="Oy">
                        <Input value={form.month ?? ""} onChange={(e) => setForm({ ...form, month: e.target.value })} />
                      </Field>
                      <Field label="Narx (UZS)">
                        <Input type="number" value={form.price_uzs} onChange={(e) => setForm({ ...form, price_uzs: num(e.target.value) })} />
                      </Field>
                      <Field label="Narx (USD)">
                        <Input type="number" value={form.price_usd} onChange={(e) => setForm({ ...form, price_usd: num(e.target.value) })} />
                      </Field>
                      <Field label="Doc xarajat (USD)">
                        <Input type="number" value={form.docs_usd} onChange={(e) => setForm({ ...form, docs_usd: num(e.target.value) })} />
                      </Field>
                      <Field label="Komissiya">
                        <Input type="number" value={form.commission} onChange={(e) => setForm({ ...form, commission: num(e.target.value) })} />
                      </Field>
                      <Field label="To'lov holati">
                        <Input value={form.payment ?? ""} onChange={(e) => setForm({ ...form, payment: e.target.value })} />
                      </Field>
                      <Field label="Odam soni">
                        <Input type="number" value={form.people} onChange={(e) => setForm({ ...form, people: num(e.target.value) })} />
                      </Field>
                      <Field label="Shartnoma turi">
                        <Input value={form.contract_type ?? ""} onChange={(e) => setForm({ ...form, contract_type: e.target.value })} />
                      </Field>
                      <Field label="Call centre">
                        <Input value={form.call_centre ?? ""} onChange={(e) => setForm({ ...form, call_centre: e.target.value })} />
                      </Field>
                      <Field label="Sotuv menejer">
                        <Input value={form.sales_manager ?? ""} onChange={(e) => setForm({ ...form, sales_manager: e.target.value })} />
                      </Field>
                      <Field label="Back office menejer">
                        <Input value={form.back_office_manager ?? ""} onChange={(e) => setForm({ ...form, back_office_manager: e.target.value })} />
                      </Field>
                      <Field label="Kompaniya">
                        <Input value={form.company ?? ""} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                      </Field>
                      <Field label="Visa natijasi">
                        <Input value={form.visa_result ?? ""} onChange={(e) => setForm({ ...form, visa_result: e.target.value })} />
                      </Field>
                      <Field label="KPI sotuv">
                        <Input type="number" value={form.kpi_sales} onChange={(e) => setForm({ ...form, kpi_sales: num(e.target.value) })} />
                      </Field>
                      <Field label="KPI back office">
                        <Input type="number" value={form.kpi_back_office} onChange={(e) => setForm({ ...form, kpi_back_office: num(e.target.value) })} />
                      </Field>
                      <Field label="Jami">
                        <Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: num(e.target.value) })} />
                      </Field>
                      <Field label="Visa fee">
                        <Input type="number" value={form.visa_fee} onChange={(e) => setForm({ ...form, visa_fee: num(e.target.value) })} />
                      </Field>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Izoh</Label>
                        <Textarea value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>
                        {t("common.cancel")}
                      </Button>
                      <Button onClick={save} disabled={saving}>
                        {saving ? t("common.saving") : t("common.save")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("nav.contracts")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">{t("common.notFound")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Sana</TableHead>
                        <TableHead>Mijoz</TableHead>
                        <TableHead>Shartnoma №</TableHead>
                        <TableHead>Telefon</TableHead>
                        <TableHead className="text-right">Narx UZS</TableHead>
                        <TableHead className="text-right">Narx USD</TableHead>
                        <TableHead className="text-right">Doc USD</TableHead>
                        <TableHead>To'lov</TableHead>
                        <TableHead>Sotuv menejer</TableHead>
                        <TableHead>Back office</TableHead>
                        <TableHead>Kompaniya</TableHead>
                        <TableHead>Visa</TableHead>
                        <TableHead className="text-right">Jami</TableHead>
                        {(canEdit || canDelete) && <TableHead></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c, i) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.contract_date ?? "—"}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{c.client_name}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.contract_no ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.phone ?? "—"}</TableCell>
                          <TableCell className="text-right">{fmt(c.price_uzs)}</TableCell>
                          <TableCell className="text-right">{fmt(c.price_usd)}</TableCell>
                          <TableCell className="text-right">{fmt(c.docs_usd)}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.payment ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.sales_manager ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.back_office_manager ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.company ?? "—"}</TableCell>
                          <TableCell>
                            {c.visa_result ? <Badge variant="outline">{c.visa_result}</Badge> : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmt(c.total)}</TableCell>
                          {(canEdit || canDelete) && (
                            <TableCell className="text-right whitespace-nowrap">
                              {canEdit && (
                                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="icon" onClick={() => remove(c)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
