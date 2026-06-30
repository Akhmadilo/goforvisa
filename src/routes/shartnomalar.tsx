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
import { useT, localeOf, getMonthNames } from "@/lib/i18n";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, RefreshCw, Upload, FileText, Wallet } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUsdRates } from "@/lib/usd-rates";
import { cn } from "@/lib/utils";

const VISA_RESULTS = ["Topshirildi", "Olindi", "Rad etildi", "Jarayonda", "Bekor qilindi", "To'xtatildi"] as const;

export const Route = createFileRoute("/shartnomalar")({
  component: ShartnomalarPage,
  validateSearch: (search: Record<string, unknown>) => ({
    openId: typeof search.openId === "string" ? search.openId : undefined,
  }),
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
  created_by: string | null;
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
  const canPay = can("contracts_pay");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["contracts-db"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as ContractRow[];
      rows.sort((a, b) => {
        const ay = Number(a.year) || 0, by = Number(b.year) || 0;
        if (ay !== by) return ay - by;
        const am = Number(a.month) || 0, bm = Number(b.month) || 0;
        if (am !== bm) return am - bm;
        const ad = a.contract_date ? new Date(a.contract_date).getTime() : 0;
        const bd = b.contract_date ? new Date(b.contract_date).getTime() : 0;
        if (ad !== bd) return ad - bd;
        return new Date((a as any).created_at).getTime() - new Date((b as any).created_at).getTime();
      });
      return rows;
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

  const { data: operators } = useQuery({
    queryKey: ["operators"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operators")
        .select("id, kind, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; kind: string; name: string }[];
    },
  });
  const opByKind = (k: string) =>
    (operators ?? []).filter((o) => o.kind === k).map((o) => o.name);
  const salesOptions = useMemo(() => opByKind("sales"), [operators]);
  const backOfficeOptions = useMemo(() => opByKind("back_office"), [operators]);
  const callCentreOptions = useMemo(() => opByKind("call_centre"), [operators]);

  const { data: contractTypes } = useQuery({
    queryKey: ["contract_types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("contract_types").select("name").order("name");
      if (error) throw error;
      return (data ?? []).map((r: { name: string }) => r.name) as string[];
    },
  });
  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("companies").select("name").order("name");
      if (error) throw error;
      return (data ?? []).map((r: { name: string }) => r.name) as string[];
    },
  });
  const contractTypeOptions = contractTypes ?? [];
  const companyOptions = companies ?? [];

  const { getRate } = useUsdRates();

  const paidUsdByContract = useMemo(() => {
    const map = new Map<string, number>();
    (payments ?? []).forEach((p) => {
      const amount = Number(p.amount || 0);
      let usd = 0;
      if ((p.currency || "").toUpperCase() === "USD") {
        usd = amount;
      } else {
        const ym = (p.paid_at || "").slice(0, 7); // YYYY-MM
        const rate = getRate(ym);
        usd = rate > 0 ? amount / rate : 0;
      }
      map.set(p.contract_id, (map.get(p.contract_id) ?? 0) + usd);
    });
    return map;
  }, [payments, getRate]);

  const [search, setSearch] = useState("");
  const [fYear, setFYear] = useState<string>("all");
  const [fMonth, setFMonth] = useState<string>("all");
  const [fSales, setFSales] = useState<string>("all");
  const [fBack, setFBack] = useState<string>("all");
  const [fCall, setFCall] = useState<string>("all");
  const [fCompany, setFCompany] = useState<string>("all");
  const [fVisa, setFVisa] = useState<string>("all");
  const [fPayment, setFPayment] = useState<string>("all");
  const rows = data ?? [];

  const uniq = (vals: (string | null | undefined)[]) =>
    Array.from(new Set(vals.map((v) => (v ?? "").trim()).filter(Boolean))).sort();
  const yearOptions = useMemo(
    () => uniq(rows.map((r) => r.year)).sort((a, b) => Number(b) - Number(a)),
    [rows],
  );
  const monthOptions = useMemo(
    () => uniq(rows.map((r) => r.month)).sort((a, b) => Number(a) - Number(b)),
    [rows],
  );
  const salesOpts = useMemo(() => uniq(rows.map((r) => r.sales_manager)), [rows]);
  const backOpts = useMemo(() => uniq(rows.map((r) => r.back_office_manager)), [rows]);
  const callOpts = useMemo(() => uniq(rows.map((r) => r.call_centre)), [rows]);
  const companyOpts = useMemo(() => uniq(rows.map((r) => r.company)), [rows]);
  const visaOpts = useMemo(() => uniq(rows.map((r) => r.visa_result)), [rows]);

  const activeFilterCount =
    (fYear !== "all" ? 1 : 0) +
    (fMonth !== "all" ? 1 : 0) +
    (fSales !== "all" ? 1 : 0) +
    (fBack !== "all" ? 1 : 0) +
    (fCall !== "all" ? 1 : 0) +
    (fCompany !== "all" ? 1 : 0) +
    (fVisa !== "all" ? 1 : 0) +
    (fPayment !== "all" ? 1 : 0);

  const clearFilters = () => {
    setFYear("all");
    setFMonth("all");
    setFSales("all");
    setFBack("all");
    setFCall("all");
    setFCompany("all");
    setFVisa("all");
    setFPayment("all");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (fYear !== "all" && (c.year ?? "") !== fYear) return false;
      if (fMonth !== "all" && (c.month ?? "") !== fMonth) return false;
      if (fSales !== "all" && (c.sales_manager ?? "") !== fSales) return false;
      if (fBack !== "all" && (c.back_office_manager ?? "") !== fBack) return false;
      if (fCall !== "all" && (c.call_centre ?? "") !== fCall) return false;
      if (fCompany !== "all" && (c.company ?? "") !== fCompany) return false;
      if (fVisa !== "all" && (c.visa_result ?? "") !== fVisa) return false;
      if (fPayment !== "all") {
        const total = Number(c.price_usd || 0);
        const paid = paidUsdByContract.get(c.id) ?? 0;
        const status =
          total === 0 ? "none" : paid + 0.01 >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
        if (status !== fPayment) return false;
      }
      if (!q) return true;
      return [
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
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [rows, search, fYear, fMonth, fSales, fBack, fCall, fCompany, fVisa, fPayment, paidUsdByContract]);

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

  // Auto-derive year and month FROM the selected contract_date
  useEffect(() => {
    if (!form.contract_date) return;
    const d = new Date(form.contract_date);
    if (isNaN(d.getTime())) return;
    const y = String(d.getFullYear());
    const m = String(d.getMonth() + 1);
    setForm((f) => (f.year === y && f.month === m ? f : { ...f, year: y, month: m }));
  }, [form.contract_date]);

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
      toast.error(t("contracts.toast.nameRequired"));
      return;
    }
    if (!form.price_uzs && !form.price_usd) {
      toast.error(t("contracts.toast.priceRequired"));
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
      toast.success(editing ? t("contracts.toast.updated") : t("contracts.toast.added"));
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["contracts-db"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: ContractRow) => {
    if (!confirm(t("contracts.toast.confirmDelete", { name: row.client_name }))) return;
    const { error } = await supabase.from("contracts").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("contracts.toast.deleted"));
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
        <div className="w-full max-w-none px-2 sm:px-4 py-4 md:py-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 md:gap-3">
            <div className="pl-10 md:pl-0">
              <h1 className="text-base md:text-xl font-bold">{t("nav.contracts")}</h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {rows.length} {t("common.records")}
                {isFetching ? ` · ${t("common.updating")}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("dash.search.placeholder")}
                  className="pl-8 w-28 sm:w-48 md:w-64"
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
            <CardContent className="p-3">
              <div className="flex flex-wrap items-end gap-2">
                <FilterSelect
                  label={t("common.year")}
                  value={fYear}
                  onChange={setFYear}
                  options={yearOptions}
                  allLabel={t("common.allYears")}
                />
                <FilterSelect
                  label={t("common.month")}
                  value={fMonth}
                  onChange={setFMonth}
                  options={monthOptions}
                  allLabel={t("common.allMonths")}
                  renderOption={(v) => getMonthNames(lang)[Number(v) - 1] ?? v}
                />
                <FilterSelect
                  label={t("contracts.col.salesManager")}
                  value={fSales}
                  onChange={setFSales}
                  options={salesOpts}
                  allLabel={t("common.all")}
                />
                <FilterSelect
                  label={t("contracts.col.backOffice")}
                  value={fBack}
                  onChange={setFBack}
                  options={backOpts}
                  allLabel={t("common.all")}
                />
                <FilterSelect
                  label={t("contracts.form.callCentre")}
                  value={fCall}
                  onChange={setFCall}
                  options={callOpts}
                  allLabel={t("common.all")}
                />
                <FilterSelect
                  label={t("contracts.col.company")}
                  value={fCompany}
                  onChange={setFCompany}
                  options={companyOpts}
                  allLabel={t("common.all")}
                />
                <FilterSelect
                  label={t("contracts.col.visa")}
                  value={fVisa}
                  onChange={setFVisa}
                  options={visaOpts}
                  allLabel={t("common.all")}
                  renderOption={(v) => visaLabel(v, t)}
                />

                <FilterSelect
                  label={t("contracts.col.status")}
                  value={fPayment}
                  onChange={setFPayment}
                  options={["paid", "partial", "unpaid"]}
                  allLabel={t("common.all")}
                  renderOption={(v) =>
                    v === "paid"
                      ? t("contracts.status.paid")
                      : v === "partial"
                        ? t("contracts.status.partial")
                        : t("contracts.status.unpaid")
                  }
                />

                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    {t("common.clear")} ({activeFilterCount})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

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
                        <TableHead>{t("contracts.col.photo")}</TableHead>
                        <TableHead>{t("contracts.col.date")}</TableHead>
                        <TableHead>{t("contracts.col.client")}</TableHead>
                        <TableHead>{t("contracts.col.no")}</TableHead>
                        <TableHead>{t("contracts.col.phone")}</TableHead>
                        <TableHead className="text-right">{t("contracts.col.price")}</TableHead>
                        <TableHead className="text-right">{t("contracts.col.paid")}</TableHead>
                        <TableHead className="text-right">{t("contracts.col.remaining")}</TableHead>
                        <TableHead>{t("contracts.col.status")}</TableHead>
                        <TableHead>{t("contracts.col.salesManager")}</TableHead>
                        <TableHead>{t("contracts.col.backOffice")}</TableHead>
                        <TableHead>{t("contracts.col.company")}</TableHead>
                        <TableHead>{t("contracts.col.visa")}</TableHead>
                        <TableHead>{t("contracts.col.pdf")}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c, i) => {
                        const paidUsd = paidUsdByContract.get(c.id) ?? 0;
                        const totalUsd = Number(c.price_usd || 0);
                        const remainingUsd = Math.max(0, totalUsd - paidUsd);
                        const status =
                          totalUsd === 0
                            ? "—"
                            : paidUsd + 0.01 >= totalUsd
                              ? t("contracts.status.paid")
                              : paidUsd > 0
                                ? t("contracts.status.partial")
                                : t("contracts.status.unpaid");
                        const isPaid = totalUsd > 0 && paidUsd + 0.01 >= totalUsd;
                        const isPartial = totalUsd > 0 && paidUsd > 0 && !isPaid;
                        const isUnpaid = totalUsd > 0 && paidUsd <= 0;
                        const variant = isPaid ? "default" : isPartial ? "secondary" : isUnpaid ? "destructive" : "outline";
                        const visaClass =
                          c.visa_result === "Olindi"
                            ? "bg-emerald-100/70 hover:bg-emerald-200/70 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 border-l-4 border-l-emerald-500"
                            : c.visa_result === "Rad etildi"
                              ? "bg-rose-100/70 hover:bg-rose-200/70 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 border-l-4 border-l-rose-500"
                              : c.visa_result === "Topshirildi"
                                ? "bg-sky-100/60 hover:bg-sky-200/60 dark:bg-sky-950/30 dark:hover:bg-sky-950/50 border-l-4 border-l-sky-500"
                                : c.visa_result === "Jarayonda"
                                  ? "bg-amber-100/60 hover:bg-amber-200/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 border-l-4 border-l-amber-500"
                                : c.visa_result === "Bekor qilindi"
                                    ? "bg-slate-100/60 hover:bg-slate-200/60 dark:bg-slate-950/30 dark:hover:bg-slate-950/50 border-l-4 border-l-slate-400"
                                    : c.visa_result === "To'xtatildi"
                                      ? "bg-zinc-100/60 hover:bg-zinc-200/60 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/60 border-l-4 border-l-zinc-500"
                                      : "border-l-4 border-l-transparent";
                        const stop = (e: React.MouseEvent) => e.stopPropagation();
                        return (
                          <TableRow
                            key={c.id}
                            className={cn(visaClass, "cursor-pointer")}
                            onClick={() => openPayments(c)}
                          >
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell onClick={stop}>
                              {c.client_photo_url ? (
                                <button
                                  onClick={() => openFile(c.client_photo_url)}
                                  className="text-primary text-xs underline"
                                >
                                  {t("contracts.view")}
                                </button>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{c.contract_date ?? "—"}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap">{c.client_name}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.contract_no ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.phone ?? "—"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <div className="font-semibold tabular-nums">${fmt(c.price_usd)}</div>
                              {c.price_uzs ? (
                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                  {fmt(c.price_uzs)} so'm
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-green-700 dark:text-green-400">
                              ${fmt(paidUsd)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-destructive">
                              {c.visa_result === "To'xtatildi" ? <span className="text-muted-foreground">—</span> : `$${fmt(remainingUsd)}`}
                            </TableCell>
                            <TableCell>
                              <Badge variant={variant as "default" | "secondary" | "destructive" | "outline"}>{status}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{c.sales_manager ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.back_office_manager ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.company ?? "—"}</TableCell>
                            <TableCell onClick={stop}>
                              {canEdit ? (
                                <VisaResultSelect contractId={c.id} value={c.visa_result} />
                              ) : c.visa_result ? (
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                  <span className={cn("inline-block h-2 w-2 rounded-full", visaResultColor(c.visa_result))} />
                                  <span className="font-medium">{visaLabel(c.visa_result, t)}</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell onClick={stop}>
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
                            <TableCell className="text-right whitespace-nowrap" onClick={stop}>
                              <Button variant="ghost" size="icon" onClick={() => openPayments(c)} title={t("contracts.payments.title")}>
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
                    {filtered.length > 0 && (() => {
                       const totals = filtered.reduce(
                         (a, c) => {
                           const paid = paidUsdByContract.get(c.id) ?? 0;
                           const price = Number(c.price_usd || 0);
                           const isStopped = c.visa_result === "To'xtatildi";
                           a.price += price;
                           a.paid += paid;
                           a.remaining += isStopped ? 0 : Math.max(0, price - paid);
                           a.people += Number(c.people || 0);
                           return a;
                         },
                        { price: 0, paid: 0, remaining: 0, people: 0 },
                      );
                      return (
                        <tfoot className="bg-muted/50 font-semibold sticky bottom-0">
                          <TableRow>
                            <TableCell colSpan={3}>{t("contracts.total")}</TableCell>
                            <TableCell>{filtered.length} {t("common.records")}</TableCell>
                            <TableCell colSpan={2} className="text-right text-muted-foreground text-xs">
                              {totals.people} {t("contracts.col.people")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">${fmt(totals.price)}</TableCell>
                            <TableCell className="text-right tabular-nums text-green-700 dark:text-green-400">${fmt(totals.paid)}</TableCell>
                            <TableCell className="text-right tabular-nums text-destructive">${fmt(totals.remaining)}</TableCell>
                            <TableCell colSpan={7}></TableCell>
                          </TableRow>
                        </tfoot>
                      );
                    })()}
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
            <Field label={t("contracts.form.client")}>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} required />
            </Field>
            <Field label={t("contracts.form.phone")}>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={t("contracts.form.priceUzs")}>
              <Input type="number" value={form.price_uzs} onChange={(e) => setForm({ ...form, price_uzs: num(e.target.value) })} />
            </Field>
            <Field label={t("contracts.form.priceUsd")}>
              <Input type="number" value={form.price_usd} onChange={(e) => setForm({ ...form, price_usd: num(e.target.value) })} />
            </Field>
            <Field label={t("contracts.form.no")}>
              <Input value={form.contract_no} onChange={(e) => setForm({ ...form, contract_no: e.target.value })} />
            </Field>
            <Field label={t("contracts.form.date")}>
              <Input type="date" value={form.contract_date} onChange={(e) => setForm({ ...form, contract_date: e.target.value })} />
            </Field>
            <Field label={t("contracts.form.year")}>
              <Input value={form.year} readOnly disabled placeholder={t("contracts.form.dateHint")} />
            </Field>
            <Field label={t("contracts.form.month")}>
              <Input
                value={form.month ? getMonthNames(lang)[Number(form.month) - 1] ?? form.month : ""}
                readOnly
                disabled
                placeholder={t("contracts.form.dateHint")}
              />
            </Field>
            <Field label={t("contracts.form.docsUsd")}>
              <Input type="number" value={form.docs_usd} onChange={(e) => setForm({ ...form, docs_usd: num(e.target.value) })} />
            </Field>
            <Field label={t("contracts.form.commission")}>
              <Input
                type="number"
                value={form.commission}
                onChange={(e) => {
                  setCommissionManual(true);
                  setForm({ ...form, commission: num(e.target.value) });
                }}
              />
            </Field>
            <Field label={t("contracts.form.people")}>
              <Input type="number" value={form.people} onChange={(e) => setForm({ ...form, people: num(e.target.value) })} />
            </Field>
            <Field label={t("contracts.form.type")}>
              <SelectBox
                value={form.contract_type}
                onChange={(v) => setForm({ ...form, contract_type: v })}
                options={contractTypeOptions}
                placeholder={t("contracts.placeholder.select")}
              />
            </Field>
            <Field label={t("contracts.form.callCentre")}>
              <SelectBox
                value={form.call_centre}
                onChange={(v) => setForm({ ...form, call_centre: v })}
                options={callCentreOptions}
                placeholder={t("contracts.placeholder.callOp")}
              />
            </Field>
            <Field label={t("contracts.form.sales")}>
              <SelectBox
                value={form.sales_manager}
                onChange={(v) => setForm({ ...form, sales_manager: v })}
                options={salesOptions}
                placeholder={t("contracts.placeholder.salesOp")}
              />
            </Field>
            <Field label={t("contracts.form.backOffice")}>
              <SelectBox
                value={form.back_office_manager}
                onChange={(v) => setForm({ ...form, back_office_manager: v })}
                options={backOfficeOptions}
                placeholder={t("contracts.placeholder.backOp")}
              />
            </Field>
            <Field label={t("contracts.form.company")}>
              <SelectBox
                value={form.company}
                onChange={(v) => setForm({ ...form, company: v })}
                options={companyOptions}
                placeholder={t("contracts.placeholder.select")}
              />
            </Field>
            <Field label={t("contracts.form.visa")}>
              <SelectBox
                value={form.visa_result}
                onChange={(v) => setForm({ ...form, visa_result: v })}
                options={VISA_RESULTS as unknown as string[]}
                placeholder={t("contracts.placeholder.select")}
                renderOption={(v) => visaLabel(v, t)}
              />
            </Field>

            <Field label={t("contracts.form.photo")}>
              <div className="flex items-center gap-2">
                <Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
                {photoUrl && !photoFile && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openFile(photoUrl)}>
                    <Upload className="h-3 w-3 mr-1" /> {t("common.view")}
                  </Button>
                )}
              </div>
            </Field>
            <Field label={t("contracts.form.pdf")}>
              <div className="flex items-center gap-2">
                <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                {pdfUrl && !pdfFile && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openFile(pdfUrl)}>
                    <FileText className="h-3 w-3 mr-1" /> {t("common.view")}
                  </Button>
                )}
              </div>
            </Field>

            <div className="md:col-span-2">
              <Label className="text-xs">{t("contracts.form.note")}</Label>
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
        canCreate={canPay}
        canDelete={canPay}
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

function SelectBox({
  value,
  onChange,
  options,
  placeholder,
  renderOption,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  renderOption?: (v: string) => string;
}) {
  const { t } = useT();
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? t("contracts.placeholder.select")}>
          {value ? (renderOption ? renderOption(value) : value) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("common.none")}</div>
        ) : (
          options.map((o) => (
            <SelectItem key={o} value={o}>
              {renderOption ? renderOption(o) : o}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function visaResultColor(result: string | null) {
  switch (result) {
    case "Olindi": return "bg-emerald-500";
    case "Rad etildi": return "bg-rose-500";
    case "Topshirildi": return "bg-sky-500";
    case "Jarayonda": return "bg-amber-500";
    case "Bekor qilindi": return "bg-slate-400";
    case "To'xtatildi": return "bg-zinc-500";
    default: return "bg-muted";
  }
}

const VISA_I18N_KEY: Record<string, string> = {
  "Olindi": "visa.Olindi",
  "Rad etildi": "visa.RadEtildi",
  "Topshirildi": "visa.Topshirildi",
  "Jarayonda": "visa.Jarayonda",
  "Bekor qilindi": "visa.BekorQilindi",
  "To'xtatildi": "visa.Toxtatildi",
};
function visaLabel(value: string | null, t: (k: any) => string) {
  if (!value) return "";
  const key = VISA_I18N_KEY[value];
  return key ? t(key) : value;
}

function VisaResultSelect({ contractId, value }: { contractId: string; value: string | null }) {
  const qc = useQueryClient();
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  const onChange = async (v: string) => {
    setSaving(true);
    const { error } = await supabase.from("contracts").update({ visa_result: v || null }).eq("id", contractId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("contracts.toast.visaUpdated"));
    qc.invalidateQueries({ queryKey: ["contracts-db"] });
  };
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={saving}>
      <SelectTrigger className="h-7 w-[150px] text-xs">
        <SelectValue placeholder="—">
          {value ? (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("inline-block h-2 w-2 rounded-full", visaResultColor(value))} />
              {visaLabel(value, t)}
            </span>
          ) : (
            "—"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {VISA_RESULTS.map((o) => (
          <SelectItem key={o} value={o}>
            <span className="inline-flex items-center gap-2">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full", visaResultColor(o))} />
              {visaLabel(o, t)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const { lang, t } = useT();
  const { user } = useAuth();
  const fmt = (n: number) => Number(n).toLocaleString(localeOf(lang), { maximumFractionDigits: 2 });

  const [photoSignedUrl, setPhotoSignedUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (open && contract?.client_photo_url) {
      supabase.storage
        .from("contract-files")
        .createSignedUrl(contract.client_photo_url, 3600)
        .then(({ data }) => { if (active) setPhotoSignedUrl(data?.signedUrl ?? null); });
    } else {
      setPhotoSignedUrl(null);
    }
    return () => { active = false; };
  }, [open, contract?.id, contract?.client_photo_url]);

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

  const payerIds = useMemo(
    () => Array.from(new Set((list ?? []).map((p) => p.created_by).filter(Boolean) as string[])),
    [list],
  );
  const { data: payerProfiles } = useQuery({
    queryKey: ["payer-profiles", payerIds.join(",")],
    queryFn: async () => {
      if (payerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", payerIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: payerIds.length > 0,
  });
  const payerNameById = useMemo(() => {
    const m = new Map<string, string>();
    (payerProfiles ?? []).forEach((p) => m.set(p.id, p.display_name ?? "—"));
    return m;
  }, [payerProfiles]);

  const [amount, setAmount] = useState<number>(0);
  const currency = "USD";
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(0);
      setPaidAt(new Date().toISOString().slice(0, 10));
      setMethod("");
      setNote("");
    }
  }, [open, contract?.id]);

  const { getRate } = useUsdRates();
  const totalUsd = Number(contract?.price_usd || 0);
  const paidUsd = (list ?? []).reduce((s, p) => {
    const amt = Number(p.amount || 0);
    if ((p.currency || "").toUpperCase() === "USD") return s + amt;
    const ym = (p.paid_at || "").slice(0, 7);
    const r = getRate(ym);
    return s + (r > 0 ? amt / r : 0);
  }, 0);
  const remainingUsd = Math.max(0, totalUsd - paidUsd);
  const total = Number(contract?.price_uzs || 0);

  const isFullyPaid = totalUsd > 0 && remainingUsd <= 0.009;

  const add = async () => {
    if (!contract) return;
    if (!amount || amount <= 0) {
      toast.error(t("contracts.toast.amount"));
      return;
    }
    if (isFullyPaid) {
      toast.error(t("contracts.toast.alreadyPaid"));
      return;
    }
    if (totalUsd > 0 && amount > remainingUsd + 0.009) {
      toast.error(`${t("contracts.toast.overpay")}: $${fmt(remainingUsd)}`);
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
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("contracts.toast.paymentAdded"));
    setAmount(0);
    setMethod("");
    setNote("");
    refetch();
    qc.invalidateQueries({ queryKey: ["contract-payments"] });
  };

  const remove = async (id: string) => {
    if (!confirm(t("contracts.toast.paymentConfirm"))) return;
    const { error } = await supabase.from("contract_payments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("contracts.toast.deleted"));
    refetch();
    qc.invalidateQueries({ queryKey: ["contract-payments"] });
  };



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4 pr-8">
            <Avatar className="h-20 w-20 border-2 border-primary/20 shadow-md shrink-0">
              {photoSignedUrl ? <AvatarImage src={photoSignedUrl} alt={contract?.client_name} className="object-cover" /> : null}
              <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                {(contract?.client_name ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate text-lg">{contract?.client_name}</DialogTitle>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {contract?.contract_no && <span>№ {contract.contract_no}</span>}
                {contract?.contract_date && <span>· {contract.contract_date}</span>}
                {contract?.phone && <span>· 📞 {contract.phone}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {contract?.company && <Badge variant="secondary" className="text-[10px]">{contract.company}</Badge>}
                {contract?.contract_type && <Badge variant="outline" className="text-[10px]">{contract.contract_type}</Badge>}
                {contract?.sales_manager && <Badge variant="outline" className="text-[10px]">👤 {contract.sales_manager}</Badge>}
                {contract?.back_office_manager && <Badge variant="outline" className="text-[10px]">🗂 {contract.back_office_manager}</Badge>}
                {contract?.visa_result && (
                  <Badge variant="outline" className="text-[10px] inline-flex items-center gap-1">
                    <span className={cn("inline-block h-2 w-2 rounded-full", visaResultColor(contract.visa_result))} />
                    {visaLabel(contract.visa_result, t)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground text-xs">{t("contracts.totalPrice")}</div>
            <div className="font-semibold">${fmt(Number(contract?.price_usd || 0))}</div>
            {contract?.price_uzs ? (
              <div className="text-[10px] text-muted-foreground">{fmt(total)} so'm</div>
            ) : null}
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground text-xs">{t("contracts.col.paid")}</div>
            <div className="font-semibold text-green-600">${fmt(paidUsd)}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground text-xs">{t("contracts.col.remaining")}</div>
            <div className="font-semibold text-destructive">${fmt(remainingUsd)}</div>
          </div>
        </div>


        {canCreate && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border-t pt-3">
            <Field label={t("contracts.col.amount") + " ($)"}>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                <Input
                  type="number"
                  className="pl-6"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </div>
            </Field>
            <Field label={t("contracts.col.currency")}>
              <Input value={currency} disabled readOnly />
            </Field>
            <Field label={t("contracts.col.date")}>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>
            <Field label={t("contracts.col.method")}>
              <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder={t("contracts.placeholder.method")} />
            </Field>
            <Button onClick={add} disabled={saving || isFullyPaid}>
              <Plus className="h-4 w-4 mr-1" /> {t("common.add")}
            </Button>
            <div className="md:col-span-5">
              <Field label={t("contracts.col.note")}>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("contracts.col.date")}</TableHead>
                <TableHead className="text-right">{t("contracts.col.amount")}</TableHead>
                <TableHead>{t("contracts.col.currency")}</TableHead>
                <TableHead>{t("contracts.col.method")}</TableHead>
                <TableHead>{t("contracts.col.creator")}</TableHead>
                <TableHead>{t("contracts.col.note")}</TableHead>
                {canDelete && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canDelete ? 7 : 6} className="text-center text-muted-foreground text-sm py-6">
                    {t("contracts.payments.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                (list ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.paid_at}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmt(Number(p.amount))}</TableCell>
                    <TableCell>{p.currency}</TableCell>
                    <TableCell>{p.method ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {p.created_by ? (payerNameById.get(p.created_by) ?? "—") : "—"}
                    </TableCell>
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
            {t("contracts.close")}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  renderOption,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
  renderOption?: (v: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={allLabel}>
            {value === "all" ? allLabel : renderOption ? renderOption(value) : value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {renderOption ? renderOption(o) : o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
