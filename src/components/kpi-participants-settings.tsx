import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useKpiRoster } from "@/hooks/use-kpi-roster";
import { KPI_ROLES, resolveKpiNames, resolveKpiSettingsNames, nameKey, type KpiParticipants } from "@/lib/kpi-participants";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export function KpiParticipantsSettings() {
  const { t } = useT();
  const roster = useKpiRoster();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<KpiParticipants | null>(null);
  const selections = draft ?? Object.fromEntries(KPI_ROLES.map(role => [role, resolveKpiNames(role, roster.data?.participants ?? {}, roster.data?.legacy[role] ?? [])])) as KpiParticipants;
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("save_kpi_participants", { p_participants: selections });
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["kpi-roster"] }); setDraft(null); toast.success(t("toast.saved")); },
    onError: (error: Error) => toast.error(error.message),
  });
  const names = resolveKpiSettingsNames(roster.data?.employees ?? [], roster.data?.legacy ?? {}, selections);
  return <Card className="p-6 space-y-4">
    <h2 className="text-lg font-semibold">{t("kpiRoster.title")}</h2>
    {roster.isPending ? <p>{t("common.loading")}</p> : roster.isError ? <p className="text-destructive">{roster.error.message}</p> : <div className="overflow-x-auto">
      <table className="w-full text-sm"><thead><tr><th className="text-left py-2">{t("kpix.employee")}</th>{KPI_ROLES.map(role => <th key={role} className="px-3 py-2">{t(`kpiRoster.${role}`)}</th>)}</tr></thead>
        <tbody>{names.map(name => <tr key={nameKey(name)} className="border-t border-border"><td className="py-3 pr-3">{name}</td>{KPI_ROLES.map(role => <td key={role} className="text-center px-3"><Checkbox aria-label={`${name} — ${t(`kpiRoster.${role}`)}`} disabled={save.isPending} checked={(selections[role] ?? []).some(n => nameKey(n) === nameKey(name))} onCheckedChange={checked => {
          const current = selections[role] ?? [];
          setDraft({ ...selections, [role]: checked === true ? [...current, name] : current.filter(n => nameKey(n) !== nameKey(name)) });
        }} /></td>)}</tr>)}</tbody></table>
    </div>}
    <Button disabled={roster.isPending || roster.isError || save.isPending || !draft} onClick={() => save.mutate()}>{save.isPending ? t("common.saving") : t("common.save")}</Button>
  </Card>;
}