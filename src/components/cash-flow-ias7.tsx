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
import { useT } from "@/lib/i18n";

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
  const { t } = useT();
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
      { label: t("ias7.section.operating"), value: NaN, kind: "section" },
      { label: t("ias7.line.receipts"), value: receipts, kind: "item", hint: t("ias7.line.receipts.hint") },
      { label: t("ias7.line.suppliers"), value: -suppliers, kind: "item", hint: t("ias7.line.suppliers.hint") },
      { label: t("ias7.line.employees"), value: -employees, kind: "item" },
      { label: t("ias7.line.advances"), value: -advances, kind: "item" },
      { label: t("ias7.subtotal.operating"), value: operating, kind: "subtotal" },

      { label: t("ias7.section.investing"), value: NaN, kind: "section" },
      { label: t("ias7.line.investing"), value: -investing, kind: "item" },
      { label: t("ias7.subtotal.investing"), value: -investing, kind: "subtotal" },

      { label: t("ias7.section.financing"), value: NaN, kind: "section" },
      { label: t("ias7.line.financing"), value: -financing, kind: "item" },
      { label: t("ias7.subtotal.financing"), value: -financing, kind: "subtotal" },

      { label: t("ias7.total.netChange"), value: netChange, kind: "total" },
      { label: t("ias7.line.opening"), value: openingCash, kind: "item" },
      { label: t("ias7.total.closing"), value: closingCash, kind: "total" },
    ];

    return { lines, operating, netChange, closingCash };
  }, [contractPays, expensePays, salaryPays, year, months, currency, getRate, t]);

  return (
    <Card className="p-4 md:p-6 border-border/70 bg-card/80" data-export-block>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20 flex items-center justify-center">
            <Landmark className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold">{t("ias7.title")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("ias7.subtitle")}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="tabular-nums">
          {t("ias7.closing")}: {fmt(calc.closingCash)}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ias7.th.indicator")}</TableHead>
              <TableHead className="text-right">{t("ias7.th.amount")} ({currency})</TableHead>
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
        {t("ias7.footnote")}
      </p>
    </Card>
  );
}
