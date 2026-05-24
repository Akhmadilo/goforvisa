import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Coins } from "lucide-react";
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
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="mb-2 flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
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
      </div>
    </div>
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
