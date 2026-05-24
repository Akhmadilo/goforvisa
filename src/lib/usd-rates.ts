import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_USD_RATE = 12600;

export type UsdRate = { year: number; month: number; rate: number };

export function useUsdRates() {
  const { data = [] } = useQuery({
    queryKey: ["usd_rates"],
    queryFn: async (): Promise<UsdRate[]> => {
      const { data, error } = await supabase
        .from("usd_rates")
        .select("year, month, rate")
        .order("year", { ascending: true })
        .order("month", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        year: Number(r.year),
        month: Number(r.month),
        rate: Number(r.rate),
      }));
    },
  });

  const map = new Map<string, number>();
  for (const r of data) {
    map.set(`${r.year}-${String(r.month).padStart(2, "0")}`, r.rate);
  }

  /** Get rate for a "YYYY-MM" key. Falls back to most recent past month, then default. */
  const getRate = (ym: string): number => {
    if (map.has(ym)) return map.get(ym)!;
    let bestKey = "";
    let bestVal: number | null = null;
    for (const [k, v] of map) {
      if (k <= ym && k > bestKey) {
        bestKey = k;
        bestVal = v;
      }
    }
    if (bestVal != null) return bestVal;
    // fallback: any rate (earliest) if no past rate exists
    const first = data[0];
    return first ? first.rate : DEFAULT_USD_RATE;
  };

  return { rates: data, map, getRate };
}
