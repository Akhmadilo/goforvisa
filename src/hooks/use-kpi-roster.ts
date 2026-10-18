import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { KPI_ROLES, type KpiParticipants, type KpiRole } from "@/lib/kpi-participants";

export function useKpiRoster() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["kpi-roster", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: tenantId, error: tenantError } = await supabase.rpc("current_tenant_id");
      if (tenantError) throw tenantError;
      if (!tenantId) throw new Error("No current company");
      const [settings, employees, operators, contracts] = await Promise.all([
        supabase.from("tenant_settings").select("business_rules").eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("employees").select("full_name, terminated_at").eq("tenant_id", tenantId).order("full_name"),
        supabase.from("operators").select("name, kind, is_active").eq("tenant_id", tenantId),
        supabase.from("contracts").select("sales_manager, back_office_manager, call_centre").eq("tenant_id", tenantId).limit(20000),
      ]);
      for (const response of [settings, employees, operators, contracts]) if (response.error) throw response.error;
      const rules = settings.data?.business_rules as { kpi_participants?: KpiParticipants } | null;
      const legacy = Object.fromEntries(KPI_ROLES.map(role => {
        const field = role === "sales" ? "sales_manager" : role === "call_centre" ? "call_centre" : "back_office_manager";
        const kind = role === "visa_bonus" ? "back_office" : role;
        return [role, [...(contracts.data ?? []).map(c => c[field] ?? ""), ...(operators.data ?? []).filter(o => o.kind === kind && o.is_active).map(o => o.name)]];
      })) as Record<KpiRole, string[]>;
      return { participants: rules?.kpi_participants ?? {}, legacy, employees: employees.data ?? [] };
    },
  });
}