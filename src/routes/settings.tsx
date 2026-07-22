import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Coins, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useT, LANGUAGES, type Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings" }] }),
});

const UZ_MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

type UsdRateRow = {
  id: string;
  year: number;
  month: number;
  rate: number;
};

function SettingsPage() {
  const { t, lang, setLang } = useT();
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="md:pl-56">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 md:py-8 space-y-6">
          <div className="mb-2 flex items-center gap-2 pl-10 md:pl-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-base md:text-xl font-bold">{t("settings.title")}</h1>
          </div>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">{t("settings.appearance")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.languageHint")}</p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code as Lang)}
                className={`flex items-center gap-3 rounded-md border p-4 text-left transition-colors ${
                  lang === l.code
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-secondary"
                }`}
              >
                <span className="text-2xl">{l.flag}</span>
                <span className="font-medium">{l.label}</span>
              </button>
            ))}
          </div>
        </Card>

        {isAdmin && <UsdRatesCard />}
        {isAdmin && <OperatorsCard />}
        {isAdmin && <LookupCard tableName="contract_types" title="Shartnoma turlari" hint="Shartnoma yaratishda tanlanadigan turlar (Tourist, Student, Work…)." invalidateKey="contract_types" refTable="contracts" refColumn="contract_type" />}
        {isAdmin && <LookupCard tableName="companies" title="Kompaniyalar" hint="Shartnoma yaratishda tanlanadigan kompaniyalar (Dream, Go for Visa…)." invalidateKey="companies" refTable="contracts" refColumn="company" />}
          {isAdmin && <LookupCard tableName="expense_categories" title="Xarajat kategoriyalari" hint="Xarajat yaratishda tanlanadigan kategoriyalar." invalidateKey="expense_categories" refTable="expenses" refColumn="category" />}
        </div>
      </div>
    </div>
  );
}

function LookupCard({ tableName, title, hint, invalidateKey, refTable, refColumn }: { tableName: string; title: string; hint: string; invalidateKey: string; refTable: string; refColumn: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [`${tableName}_admin`],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await (supabase as any).from(tableName).select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: [`${tableName}_admin`] });
    qc.invalidateQueries({ queryKey: [invalidateKey] });
    qc.invalidateQueries({ queryKey: ["contracts-db"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
  };

  const add = async () => {
    const n = name.trim();
    if (!n) { toast.error("Nom kiriting"); return; }
    setSaving(true);
    const { error } = await (supabase as any).from(tableName).insert({ name: n });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Qo'shildi");
    setName("");
    invalidateAll();
  };

  const startEdit = (r: { id: string; name: string }) => {
    setEditId(r.id);
    setEditName(r.name);
  };
  const cancelEdit = () => { setEditId(null); setEditName(""); };

  const saveEdit = async (oldName: string) => {
    const n = editName.trim();
    if (!n) { toast.error("Nom kiriting"); return; }
    if (n === oldName) { cancelEdit(); return; }
    if (rows.some((r) => r.id !== editId && r.name.toLowerCase() === n.toLowerCase())) {
      toast.error("Bu nom allaqachon mavjud");
      return;
    }
    setSaving(true);
    // Update lookup row
    const upd = await (supabase as any).from(tableName).update({ name: n }).eq("id", editId);
    if (upd.error) { setSaving(false); toast.error(upd.error.message); return; }
    // Cascade rename referencing rows
    const ref = await (supabase as any).from(refTable).update({ [refColumn]: n }).eq(refColumn, oldName);
    setSaving(false);
    if (ref.error) { toast.error(`Yangilandi, lekin ${refTable} yangilanmadi: ${ref.error.message}`); }
    else { toast.success("Yangilandi va barcha yozuvlarga qo'llanildi"); }
    cancelEdit();
    invalidateAll();
  };

  const remove = async (id: string) => {
    if (!confirm("O'chirilsinmi?")) return;
    const { error } = await (supabase as any).from(tableName).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("O'chirildi");
    invalidateAll();
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <div className="sm:col-span-3">
          <label className="text-xs text-muted-foreground mb-1 block">Nom</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yangi nom" onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <Button onClick={add} disabled={saving} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {saving ? "Saqlanmoqda..." : "Qo'shish"}
        </Button>
      </div>
      <div className="mt-4 rounded-md border border-border">
        {isLoading ? (
          <div className="p-3 text-xs text-muted-foreground">Yuklanmoqda...</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Hali qo'shilmagan</div>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40">
                {editId === r.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(r.name);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                      className="h-8"
                    />
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" disabled={saving} onClick={() => saveEdit(r.name)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{r.name}</span>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

type OperatorKind = "call_centre" | "sales" | "back_office";
type OperatorRow = { id: string; kind: OperatorKind; name: string; is_active?: boolean };

const KIND_LABELS: Record<OperatorKind, string> = {
  call_centre: "Call centre",
  sales: "Sotuv (Sales)",
  back_office: "Back office",
};

function OperatorsCard() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<OperatorKind>("sales");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["operators_admin"],
    queryFn: async (): Promise<OperatorRow[]> => {
      const { data, error } = await (supabase as any)
        .from("operators")
        .select("id, kind, name, is_active")
        .order("kind")
        .order("name");
      if (error) throw error;
      return (data ?? []) as OperatorRow[];
    },
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["operators_admin"] });
    qc.invalidateQueries({ queryKey: ["operators"] });
    qc.invalidateQueries({ queryKey: ["contracts-db"] });
  };

  const add = async () => {
    const n = name.trim();
    if (!n) { toast.error("Ism kiriting"); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("operators").insert({ kind, name: n });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Qo'shildi");
    setName("");
    invalidateAll();
  };

  const remove = async (id: string) => {
    if (!confirm("O'chirilsinmi?")) return;
    const { error } = await (supabase as any).from("operators").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("O'chirildi");
    invalidateAll();
  };

  const toggleActive = async (r: OperatorRow) => {
    const next = r.is_active === false;
    const { error } = await (supabase as any)
      .from("operators")
      .update({ is_active: next })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Faol qilindi" : "Nofaol qilindi");
    invalidateAll();
  };

  const startEdit = (r: OperatorRow) => { setEditId(r.id); setEditName(r.name); };
  const cancelEdit = () => { setEditId(null); setEditName(""); };

  const KIND_TO_COL: Record<OperatorKind, string> = {
    sales: "sales_manager",
    back_office: "back_office_manager",
    call_centre: "call_centre",
  };

  const saveEdit = async (r: OperatorRow) => {
    const n = editName.trim();
    if (!n) { toast.error("Ism kiriting"); return; }
    if (n === r.name) { cancelEdit(); return; }
    if (rows.some((x) => x.kind === r.kind && x.id !== r.id && x.name.toLowerCase() === n.toLowerCase())) {
      toast.error("Bu ism allaqachon mavjud");
      return;
    }
    setSaving(true);
    const upd = await (supabase as any).from("operators").update({ name: n }).eq("id", r.id);
    if (upd.error) { setSaving(false); toast.error(upd.error.message); return; }
    const col = KIND_TO_COL[r.kind];
    const ref = await (supabase as any).from("contracts").update({ [col]: n }).eq(col, r.name);
    setSaving(false);
    if (ref.error) toast.error(`Yangilandi, lekin shartnomalar yangilanmadi: ${ref.error.message}`);
    else toast.success("Yangilandi va barcha shartnomalarga qo'llanildi");
    cancelEdit();
    invalidateAll();
  };

  const grouped: Record<OperatorKind, OperatorRow[]> = {
    call_centre: [], sales: [], back_office: [],
  };
  rows.forEach((r) => grouped[r.kind]?.push(r));

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Operatorlar</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Call centre, sotuv va back office xodimlarini boshqaring. Shartnoma yaratishda shu ro'yxatdan tanlanadi.
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Bo'lim</label>
          <Select value={kind} onValueChange={(v) => setKind(v as OperatorKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as OperatorKind[]).map((k) => (
                <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Ism familiya</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Aziz Karimov" />
        </div>
        <Button onClick={add} disabled={saving} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {saving ? "Saqlanmoqda..." : "Qo'shish"}
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(KIND_LABELS) as OperatorKind[]).map((k) => (
          <div key={k} className="rounded-md border border-border">
            <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">
              {KIND_LABELS[k]} <span className="text-muted-foreground">({grouped[k].length})</span>
            </div>
            <div className="p-2 space-y-1">
              {isLoading ? (
                <div className="text-xs text-muted-foreground p-2">Yuklanmoqda...</div>
              ) : grouped[k].length === 0 ? (
                <div className="text-xs text-muted-foreground p-2">Hali qo'shilmagan</div>
              ) : grouped[k].map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-1 rounded px-2 py-1 hover:bg-muted/50">
                  {editId === r.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(r);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autoFocus
                        className="h-7 text-sm"
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" disabled={saving} onClick={() => saveEdit(r)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm flex-1">{r.name}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function UsdRatesCard() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [rate, setRate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["usd_rates_admin"],
    queryFn: async (): Promise<UsdRateRow[]> => {
      const { data, error } = await (supabase as any)
        .from("usd_rates")
        .select("id, year, month, rate")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UsdRateRow[];
    },
  });

  const onSave = async () => {
    const r = Number(rate);
    if (!r || r <= 0) { toast.error("Kursni to'g'ri kiriting"); return; }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("usd_rates")
      .upsert({ year, month, rate: r }, { onConflict: "year,month" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Kurs saqlandi");
    setRate("");
    qc.invalidateQueries({ queryKey: ["usd_rates_admin"] });
    qc.invalidateQueries({ queryKey: ["usd_rates"] });
  };

  const onDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    const { error } = await (supabase as any).from("usd_rates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("O'chirildi");
    qc.invalidateQueries({ queryKey: ["usd_rates_admin"] });
    qc.invalidateQueries({ queryKey: ["usd_rates"] });
  };

  const years: number[] = [];
  for (let y = now.getFullYear() + 1; y >= 2020; y--) years.push(y);

  const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Coins className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Valyuta kursi (USD → UZS)</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Har oy uchun kursni kiriting. Moliyaviy hisobotlar va USD xarajatlar shu kurs bo'yicha hisoblanadi.
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Yil</label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Oy</label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UZ_MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">1 USD = ? UZS</label>
          <Input
            type="number"
            placeholder="masalan 12600"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <Button onClick={onSave} disabled={saving} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>

      <div className="mt-5 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Yil</TableHead>
              <TableHead>Oy</TableHead>
              <TableHead className="text-right">Kurs (1 USD)</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Yuklanmoqda...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Hali kurs kiritilmagan</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.year}</TableCell>
                <TableCell>{UZ_MONTHS[r.month - 1]}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmt(r.rate)} so'm</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                    onClick={() => onDelete(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
