import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CcTier = {
  id: string;
  min_count: number;
  max_count: number | null;
  base_uzs: number;
  kpi_pct: number;
};

export const CC_TIERS_KEY = ["call-centre-tiers"];

/** Fallback used only when no tiers are configured yet. */
export const FALLBACK_CC_TIERS: Omit<CcTier, "id">[] = [
  { min_count: 1, max_count: 4, base_uzs: 1_000_000, kpi_pct: 0 },
  { min_count: 5, max_count: 9, base_uzs: 1_500_000, kpi_pct: 0 },
  { min_count: 10, max_count: 14, base_uzs: 2_000_000, kpi_pct: 5 },
  { min_count: 15, max_count: 19, base_uzs: 2_500_000, kpi_pct: 10 },
  { min_count: 20, max_count: 24, base_uzs: 3_000_000, kpi_pct: 15 },
  { min_count: 25, max_count: 29, base_uzs: 3_500_000, kpi_pct: 20 },
  { min_count: 30, max_count: null, base_uzs: 4_000_000, kpi_pct: 25 },
];

export async function fetchCcTiers(): Promise<CcTier[]> {
  const { data, error } = await (supabase as any)
    .from("call_centre_tiers")
    .select("id, min_count, max_count, base_uzs, kpi_pct")
    .order("min_count", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CcTier[];
  return rows.map((r) => ({
    ...r,
    min_count: Number(r.min_count),
    max_count: r.max_count === null ? null : Number(r.max_count),
    base_uzs: Number(r.base_uzs),
    kpi_pct: Number(r.kpi_pct),
  }));
}

export function useCcTiers() {
  return useQuery({
    queryKey: CC_TIERS_KEY,
    queryFn: fetchCcTiers,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

function tierFor(tiers: readonly Omit<CcTier, "id">[], count: number) {
  return tiers.find(
    (t) => count >= t.min_count && (t.max_count === null || count <= t.max_count),
  );
}

export function ccBaseFor(tiers: readonly Omit<CcTier, "id">[] | undefined, count: number) {
  if (count <= 0) return 0;
  const list = tiers && tiers.length ? tiers : FALLBACK_CC_TIERS;
  return tierFor(list, count)?.base_uzs ?? 0;
}

export function ccKpiPctFor(tiers: readonly Omit<CcTier, "id">[] | undefined, count: number) {
  if (count <= 0) return 0;
  const list = tiers && tiers.length ? tiers : FALLBACK_CC_TIERS;
  return tierFor(list, count)?.kpi_pct ?? 0;
}
