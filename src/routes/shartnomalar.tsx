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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { useT, localeOf } from "@/lib/i18n";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, RefreshCw, Upload, FileText, Wallet } from "lucide-react";

const VISA_RESULTS = ["Topshirildi", "Olindi", "Rad etildi", "Jarayonda", "Bekor qilindi"] as const;
const CONTRACT_TYPES = ["Tourist", "Student", "Work", "Business", "Family", "Boshqa"] as const;
const PAYMENT_STATUSES = ["To'lanmagan", "Qisman", "To'langan"] as const;
const CALL_CENTRES = ["Ichki", "Tashqi", "Instagram", "Telegram", "Boshqa"] as const;
const COMPANIES = ["GoForVisa", "Boshqa"] as const;

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
  client_photo_url: string | null;
  contract_pdf_url: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  contract_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  method: string | null;
  note: string | null;
};

type FormState = {
  client_name: string;
  contract_no: string;
  contract_date: string;
  phone: string;
  year: string;
  month: string;
  price_uzs: number;
  price_usd: number;
  docs_usd: number;
  commission: number;
  payment: string;
  people: number;
  contract_type: string;
  call_centre: string;
  sales_manager: string;
  back_office_manager: string;
  company: string;
  visa_result: string;
  note: string;
};

const emptyForm: FormState = {
  client_name: "",
  contract_no: "",
  contract_date: new Date().toISOString().slice(0, 10),
  phone: "",
  year: new Date().getFullYear().toString(),
  month: "",
  price_uzs: 0,
  price_usd: 0,
  docs_usd: 0,
  commission: 0,
  payment: "",
  people: 1,
  contract_type: "",
  call_centre: "",
  sales_manager: "",
  back_office_manager: "",
  company: "",
  visa_result: "",
  note: "",
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
      return (data ?? []) as unknown as ContractRow[];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["contract-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contract_payments").select("*");
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  const { data: employees } = useQuery({
    queryKey: ["employees-for-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, position")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const employeeNames = useMemo(
    () => (employees ?? []).map((e) => e.full_name).filter(Boolean),
    [employees],
  );

  const paidByContract = useMemo(() => {
    const map = new Map<string, number>();
    (payments ?? []).forEach((p) => {
      map.set(p.contract_id, (map.get(p.contract_id) ?? 0) + Number(p.amount || 0));
    });
    return map;
  }, [payments]);

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

  // Form dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContractRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [commissionManual, setCommissionManual] = useState(false);

  // Auto-calculate commission = price_usd - docs_usd (unless manually edited)
  useEffect(() => {
    if (commissionManual) return;
    const calc = Number(form.price_usd || 0) - Number(form.docs_usd || 0);
    setForm((f) => (f.commission === calc ? f : { ...f, commission: calc }));
  }, [form.price_usd, form.docs_usd, commissionManual]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setPhotoFile(null);
    setPdfFile(null);
    setPhotoUrl(null);
    setPdfUrl(null);
    setCommissionManual(false);
    setDialogOpen(true);
  };
  const openEdit = (row: ContractRow) => {
    setEditing(row);
    setForm({
      client_name: row.client_name,
      contract_no: row.contract_no ?? "",
      contract_date: row.contract_date ?? "",
      phone: row.phone ?? "",
      year: row.year ?? "",
      month: row.month ?? "",
      price_uzs: Number(row.price_uzs ?? 0),
      price_usd: Number(row.price_usd ?? 0),
      docs_usd: Number(row.docs_usd ?? 0),
      commission: Number(row.commission ?? 0),
      payment: row.payment ?? "",
      people: row.people ?? 1,
      contract_type: row.contract_type ?? "",
      call_centre: row.call_centre ?? "",
      sales_manager: row.sales_manager ?? "",
      back_office_manager: row.back_office_manager ?? "",
      company: row.company ?? "",
      visa_result: row.visa_result ?? "",
      note: row.note ?? "",
    });
    setPhotoFile(null);
    setPdfFile(null);
    setPhotoUrl(row.client_photo_url);
    setPdfUrl(row.contract_pdf_url);
    setCommissionManual(true); // preserve stored commission
    setDialogOpen(true);
  };

  const uploadFile = async (file: File, prefix: string): Promise<string> => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("contract-files").upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    return path;
  };

  const signed = async (path: string | null | undefined) => {
    if (!path) return null;
    const { data } = await supabase.storage.from("contract-files").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  const save = async () => {
    if (!form.client_name.trim()) {
      toast.error("Ism familiya majburiy");
      return;
    }
    if (!form.price_uzs && !form.price_usd) {
      toast.error("Shartnoma narxi majburiy (UZS yoki USD)");
      return;
    }
    setSaving(true);
    try {
      let newPhotoPath = photoUrl;
      let newPdfPath = pdfUrl;
      if (photoFile) newPhotoPath = await uploadFile(photoFile, "photos");
      if (pdfFile) newPdfPath = await uploadFile(pdfFile, "pdfs");

      const payload = {
        ...form,
        contract_date: form.contract_date || null,
        year: form.year || null,
        month: form.month || null,
        contract_no: form.contract_no || null,
        phone: form.phone || null,
        payment: form.payment || null,
        contract_type: form.contract_type || null,
        call_centre: form.call_centre || null,
        sales_manager: form.sales_manager || null,
        back_office_manager: form.back_office_manager || null,
        company: form.company || null,
        visa_result: form.visa_result || null,
        note: form.note || null,
        client_photo_url: newPhotoPath,
        contract_pdf_url: newPdfPath,
      };
      const res = editing
        ? await supabase.from("contracts").update(payload).eq("id", editing.id)
        : await supabase.from("contracts").insert(payload);
      if (res.error) throw res.error;
      toast.success(editing ? "Yangilandi" : "Qo'shildi");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["contracts-db"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
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
    qc.invalidateQueries({ queryKey: ["contract-payments"] });
  };

  const num = (v: string) => (v === "" ? 0 : Number(v));

  // Payments dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payContract, setPayContract] = useState<ContractRow | null>(null);
  const openPayments = (c: ContractRow) => {
    setPayContract(c);
    setPayOpen(true);
  };

  // File viewer
  const openFile = async (path: string | null) => {
    const url = await signed(path);
    if (url) window.open(url, "_blank");
  };

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
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" /> {t("common.add")}
                </Button>
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
                        <TableHead>Rasm</TableHead>
                        <TableHead>Sana</TableHead>
                        <TableHead>Ism familiya</TableHead>
                        <TableHead>Shartnoma №</TableHead>
                        <TableHead>Telefon</TableHead>
                        <TableHead className="text-right">Narx UZS</TableHead>
                        <TableHead className="text-right">Narx USD</TableHead>
                        <TableHead className="text-right">To'langan</TableHead>
                        <TableHead className="text-right">Qoldiq</TableHead>
                        <TableHead>Holat</TableHead>
                        <TableHead>Sotuv menejer</TableHead>
                        <TableHead>Visa</TableHead>
                        <TableHead>PDF</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c, i) => {
                        const paid = paidByContract.get(c.id) ?? 0;
                        const total = Number(c.price_uzs || 0);
                        const remaining = Math.max(0, total - paid);
                        const status =
                          total === 0
                            ? "—"
                            : paid >= total
                              ? "To'langan"
                              : paid > 0
                                ? "Qisman"
                                : "To'lanmagan";
                        const variant =
                          status === "To'langan"
                            ? "default"
                            : status === "Qisman"
                              ? "secondary"
                              : status === "To'lanmagan"
                                ? "destructive"
                                : "outline";
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              {c.client_photo_url ? (
                                <button
                                  onClick={() => openFile(c.client_photo_url)}
                                  className="text-primary text-xs underline"
                                >
                                  Ko'rish
                                </button>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{c.contract_date ?? "—"}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap">{c.client_name}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.contract_no ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.phone ?? "—"}</TableCell>
                            <TableCell className="text-right">{fmt(c.price_uzs)}</TableCell>
                            <TableCell className="text-right">{fmt(c.price_usd)}</TableCell>
                            <TableCell className="text-right">{fmt(paid)}</TableCell>
                            <TableCell className="text-right">{fmt(remaining)}</TableCell>
                            <TableCell>
                              <Badge variant={variant as "default" | "secondary" | "destructive" | "outline"}>{status}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{c.sales_manager ?? "—"}</TableCell>
                            <TableCell>
                              {c.visa_result ? <Badge variant="outline">{c.visa_result}</Badge> : "—"}
                            </TableCell>
                            <TableCell>
                              {c.contract_pdf_url ? (
                                <button
                                  onClick={() => openFile(c.contract_pdf_url)}
                                  className="text-primary text-xs underline inline-flex items-center gap-1"
                                >
                                  <FileText className="h-3 w-3" /> PDF
                                </button>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <Button variant="ghost" size="icon" onClick={() => openPayments(c)} title="To'lovlar">
                                <Wallet className="h-4 w-4" />
                              </Button>
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("common.edit") : t("common.add")} — {t("nav.contracts")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <Field label="Ism familiya *">
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} required />
            </Field>
            <Field label="Telefon">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Shartnoma narxi (UZS) *">
              <Input type="number" value={form.price_uzs} onChange={(e) => setForm({ ...form, price_uzs: num(e.target.value) })} />
            </Field>
            <Field label="Shartnoma narxi (USD)">
              <Input type="number" value={form.price_usd} onChange={(e) => setForm({ ...form, price_usd: num(e.target.value) })} />
            </Field>
            <Field label="Shartnoma №">
              <Input value={form.contract_no} onChange={(e) => setForm({ ...form, contract_no: e.target.value })} />
            </Field>
            <Field label="Sana">
              <Input type="date" value={form.contract_date} onChange={(e) => setForm({ ...form, contract_date: e.target.value })} />
            </Field>
            <Field label="Yil">
              <Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </Field>
            <Field label="Oy">
              <Input value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
            </Field>
            <Field label="Doc xarajat (USD)">
              <Input type="number" value={form.docs_usd} onChange={(e) => setForm({ ...form, docs_usd: num(e.target.value) })} />
            </Field>
            <Field label="Komissiya (USD) — avto">
              <Input
                type="number"
                value={form.commission}
                onChange={(e) => {
                  setCommissionManual(true);
                  setForm({ ...form, commission: num(e.target.value) });
                }}
              />
            </Field>
            <Field label="To'lov holati">
              <SelectBox
                value={form.payment}
                onChange={(v) => setForm({ ...form, payment: v })}
                options={PAYMENT_STATUSES as unknown as string[]}
                placeholder="Tanlang"
              />
            </Field>
            <Field label="Odam soni">
              <Input type="number" value={form.people} onChange={(e) => setForm({ ...form, people: num(e.target.value) })} />
            </Field>
            <Field label="Shartnoma turi">
              <SelectBox
                value={form.contract_type}
                onChange={(v) => setForm({ ...form, contract_type: v })}
                options={CONTRACT_TYPES as unknown as string[]}
                placeholder="Tanlang"
              />
            </Field>
            <Field label="Call centre">
              <SelectBox
                value={form.call_centre}
                onChange={(v) => setForm({ ...form, call_centre: v })}
                options={CALL_CENTRES as unknown as string[]}
                placeholder="Tanlang"
              />
            </Field>
            <Field label="Sotuv menejer">
              <SelectBox
                value={form.sales_manager}
                onChange={(v) => setForm({ ...form, sales_manager: v })}
                options={employeeNames}
                placeholder="Xodimni tanlang"
              />
            </Field>
            <Field label="Back office menejer">
              <SelectBox
                value={form.back_office_manager}
                onChange={(v) => setForm({ ...form, back_office_manager: v })}
                options={employeeNames}
                placeholder="Xodimni tanlang"
              />
            </Field>
            <Field label="Kompaniya">
              <SelectBox
                value={form.company}
                onChange={(v) => setForm({ ...form, company: v })}
                options={COMPANIES as unknown as string[]}
                placeholder="Tanlang"
              />
            </Field>
            <Field label="Visa natijasi">
              <SelectBox
                value={form.visa_result}
                onChange={(v) => setForm({ ...form, visa_result: v })}
                options={VISA_RESULTS as unknown as string[]}
                placeholder="Tanlang"
              />
            </Field>

            <Field label="Klient rasmi">
              <div className="flex items-center gap-2">
                <Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
                {photoUrl && !photoFile && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openFile(photoUrl)}>
                    <Upload className="h-3 w-3 mr-1" /> Ko'rish
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Shartnoma PDF">
              <div className="flex items-center gap-2">
                <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                {pdfUrl && !pdfFile && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openFile(pdfUrl)}>
                    <FileText className="h-3 w-3 mr-1" /> Ko'rish
                  </Button>
                )}
              </div>
            </Field>

            <div className="md:col-span-2">
              <Label className="text-xs">Izoh</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
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

      {/* Payments dialog */}
      <PaymentsDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        contract={payContract}
        canCreate={canCreate}
        canDelete={canDelete}
      />
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

function PaymentsDialog({
  open,
  onOpenChange,
  contract,
  canCreate,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: ContractRow | null;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const { lang } = useT();
  const fmt = (n: number) => Number(n).toLocaleString(localeOf(lang), { maximumFractionDigits: 2 });

  const { data: list, refetch } = useQuery({
    queryKey: ["contract-payments", contract?.id],
    queryFn: async () => {
      if (!contract) return [];
      const { data, error } = await supabase
        .from("contract_payments")
        .select("*")
        .eq("contract_id", contract.id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
    enabled: !!contract && open,
  });

  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("UZS");
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(0);
      setCurrency("UZS");
      setPaidAt(new Date().toISOString().slice(0, 10));
      setMethod("");
      setNote("");
    }
  }, [open, contract?.id]);

  const total = Number(contract?.price_uzs || 0);
  const paid = (list ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining = Math.max(0, total - paid);

  const add = async () => {
    if (!contract) return;
    if (!amount || amount <= 0) {
      toast.error("Summa kiriting");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("contract_payments").insert({
      contract_id: contract.id,
      amount,
      currency,
      paid_at: paidAt,
      method: method || null,
      note: note || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("To'lov qo'shildi");
    setAmount(0);
    setMethod("");
    setNote("");
    refetch();
    qc.invalidateQueries({ queryKey: ["contract-payments"] });
  };

  const remove = async (id: string) => {
    if (!confirm("To'lov o'chirilsinmi?")) return;
    const { error } = await supabase.from("contract_payments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("O'chirildi");
    refetch();
    qc.invalidateQueries({ queryKey: ["contract-payments"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>To'lovlar — {contract?.client_name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground text-xs">Jami narx</div>
            <div className="font-semibold">{fmt(total)}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground text-xs">To'langan</div>
            <div className="font-semibold text-green-600">{fmt(paid)}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground text-xs">Qoldiq</div>
            <div className="font-semibold text-destructive">{fmt(remaining)}</div>
          </div>
        </div>

        {canCreate && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border-t pt-3">
            <Field label="Summa">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </Field>
            <Field label="Valyuta">
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </Field>
            <Field label="Sana">
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>
            <Field label="Usul">
              <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Naqd, karta..." />
            </Field>
            <Button onClick={add} disabled={saving}>
              <Plus className="h-4 w-4 mr-1" /> Qo'shish
            </Button>
            <div className="md:col-span-5">
              <Field label="Izoh">
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sana</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>Valyuta</TableHead>
                <TableHead>Usul</TableHead>
                <TableHead>Izoh</TableHead>
                {canDelete && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canDelete ? 6 : 5} className="text-center text-muted-foreground text-sm py-6">
                    To'lovlar yo'q
                  </TableCell>
                </TableRow>
              ) : (
                (list ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.paid_at}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(Number(p.amount))}</TableCell>
                    <TableCell>{p.currency}</TableCell>
                    <TableCell>{p.method ?? "—"}</TableCell>
                    <TableCell>{p.note ?? "—"}</TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
