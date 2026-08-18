import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Line = {
  label: string;
  value: number;
  kind: "item" | "subtotal" | "section" | "total";
  hint?: string;
};

const INVESTING_HINTS = [
  "asbob", "jihoz", "mebel", "texnika", "kompyuter", "noutbuk", "avto", "mashina",
  "ta'mir", "tamir", "remont", "kapital", "investitsiya", "equipment",
];
const FINANCING_HINTS = [
  "kredit", "qarz", "zayom", "dividend", "ustav", "loan", "financing", "lizing", "leasing",
];

function classify(category: string): "operating" | "investing" | "financing" {
  const c = (category || "").toLowerCase();
  if (FINANCING_HINTS.some((h) => c.includes(h))) return "financing";
  if (INVESTING_HINTS.some((h) => c.includes(h))) return "investing";
  return "operating";
}

export function CashFlowIas7({
  year, months, currency, getRate, fmt, enabled,
}: {
  year: string;
  months: number[];
  currency: "UZS" | "USD";
  getRate: (ym: string) => number;
  fmt: (n: number) => string;
  enabled: boolean;
}) {
  const { data: contractPays = [] } = useQuery({
    queryKey: ["ias7-contract-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments").select("amount, currency, paid_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });

  const { data: expensePays = [] } = useQuery({
    queryKey: ["ias7-expense-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_payments").select("amount, paid_at, expenses(currency, category)");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });

  const { data: salaryPays = [] } = useQuery({
    queryKey: ["ias7-salary-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_payments").select("amount, paid_at, kind");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });

  const calc = useMemo(() => {
    const inScope = (date: string) => {
      if (!date || date.length < 7) return null;
      const y = date.slice(0, 4);
      const mm = date.slice(5, 7);
      if (year !== "all" && y !== year) return null;
      if (months.length > 0 && !months.includes(Number(mm))) return null;
      return `${y}-${mm}`;
    };
    const before = (date: string) => {
      if (!date || date.length < 7) return false;
      if (year === "all") return false;
      const y = date.slice(0, 4);
      const mm = Number(date.slice(5, 7));
      const minM = months.length > 0 ? Math.min(...months) : 1;
      if (y < year) return true;
      return y === year && mm < minM;
    };
    const conv = (raw: number, isUsd: boolean, key: string) => {
      const rate = getRate(key) || 1;
      if (currency === "USD") return isUsd ? raw : raw / rate;
      return isUsd ? raw * rate : raw;
    };
    const keyOf = (date: string) => `${date.slice(0, 4)}-${date.slice(5, 7)}`;

    let receipts = 0, suppliers = 0, employees = 0, advances = 0;
    let investing = 0, financing = 0;
    let openingCash = 0;

    for (const p of contractPays as any[]) {
      const date = String(p.paid_at ?? "");
      const isUsd = (p.currency ?? "UZS") === "USD";
      const amt = Number(p.amount) || 0;
      const k = inScope(date);
      if (k) receipts += conv(amt, isUsd, k);
      else if (before(date)) openingCash += conv(amt, isUsd, keyOf(date));
    }

    for (const p of expensePays as any[]) {
      const date = String(p.paid_at ?? "");
      const isUsd = (p.expenses?.currency ?? "UZS") === "USD";
      const amt = Number(p.amount) || 0;
      const bucket = classify(p.expenses?.category ?? "");
      const k = inScope(date);
      if (k) {
        const v = conv(amt, isUsd, k);
        if (bucket === "investing") investing += v;
        else if (bucket === "financing") financing += v;
        else suppliers += v;
      } else if (before(date)) {
        openingCash -= conv(amt, isUsd, keyOf(date));
      }
    }

    for (const p of salaryPays as any[]) {
      const date = String(p.paid_at ?? "");
      const amt = Number(p.amount) || 0;
      const k = inScope(date);
      if (k) {
        const v = conv(amt, false, k);
        if ((p.kind ?? "") === "advance") advances += v;
        else employees += v;
      } else if (before(date)) {
        openingCash -= conv(amt, false, keyOf(date));
      }
    }

    const operating = receipts - suppliers - employees - advances;
    const netChange = operating - investing - financing;
    const closingCash = openingCash + netChange;

    const lines: Line[] = [
      { label: "Operatsion faoliyatdan pul oqimi", value: NaN, kind: "section" },
      { label: "Mijozlardan tushgan tushum", value: receipts, kind: "item", hint: "Shartnoma to'lovlari" },
      { label: "Yetkazib beruvchilarga to'lovlar", value: -suppliers, kind: "item", hint: "Operatsion xarajatlar" },
      { label: "Xodimlarga to'langan ish haqi", value: -employees, kind: "item" },
      { label: "Xodimlarga berilgan avanslar", value: -advances, kind: "item" },
      { label: "Operatsion faoliyatdan sof pul oqimi", value: operating, kind: "subtotal" },

      { label: "Investitsion faoliyatdan pul oqimi", value: NaN, kind: "section" },
      { label: "Asosiy vositalar va jihozlarni sotib olish", value: -investing, kind: "item" },
      { label: "Investitsion faoliyatdan sof pul oqimi", value: -investing, kind: "subtotal" },

      { label: "Moliyaviy faoliyatdan pul oqimi", value: NaN, kind: "section" },
      { label: "Kredit/qarz to'lovlari va dividendlar", value: -financing, kind: "item" },
      { label: "Moliyaviy faoliyatdan sof pul oqimi", value: -financing, kind: "subtotal" },

      { label: "Pul mablag'larining sof o'zgarishi", value: netChange, kind: "total" },
      { label: "Davr boshiga pul qoldig'i", value: openingCash, kind: "item" },
      { label: "Davr oxiriga pul qoldig'i", value: closingCash, kind: "total" },
    ];

    return { lines, operating, netChange, closingCash };
  }, [contractPays, expensePays, salaryPays, year, months, currency, getRate]);

  return (
    <Card className="p-4 md:p-6 border-border/70 bg-card/80" data-export-block>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20 flex items-center justify-center">
            <Landmark className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold">Pul oqimi to'g'risidagi hisobot (IAS 7)</h3>
            <p className="text-xs text-muted-foreground">
              Xalqaro standart (IFRS / IAS 7) — to'g'ridan-to'g'ri usul: operatsion, investitsion va moliyaviy faoliyat
            </p>
          </div>
        </div>
        <Badge variant="outline" className="tabular-nums">
          Davr oxiriga qoldiq: {fmt(calc.closingCash)}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ko'rsatkich</TableHead>
              <TableHead className="text-right">Summa ({currency})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calc.lines.map((l, i) => {
              if (l.kind === "section") {
                return (
                  <TableRow key={i} className="bg-muted/40">
                    <TableCell colSpan={2} className="font-semibold uppercase text-[11px] tracking-wide">
                      {l.label}
                    </TableCell>
                  </TableRow>
                );
              }
              const strong = l.kind === "subtotal" || l.kind === "total";
              return (
                <TableRow key={i} className={cn(l.kind === "total" && "bg-muted/30")}>
                  <TableCell className={cn(strong ? "font-semibold" : "pl-6")}>
                    {l.label}
                    {l.hint && <span className="ml-2 text-[11px] text-muted-foreground">{l.hint}</span>}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right tabular-nums",
                    strong && "font-semibold",
                    l.value < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                  )}>
                    {l.value < 0 ? `(${fmt(Math.abs(l.value))})` : fmt(l.value)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Izoh: hisobot faqat haqiqiy pul harakatlari (to'lovlar) asosida tuzilgan. Xarajat kategoriyalari
        avtomatik ravishda operatsion, investitsion va moliyaviy faoliyatga ajratiladi. Davr boshiga qoldiq —
        tanlangan davrgacha bo'lgan barcha to'lovlar farqi.
      </p>
    </Card>
  );
}
