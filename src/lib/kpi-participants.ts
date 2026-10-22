export const KPI_ROLES = ["sales", "back_office", "call_centre", "visa_bonus"] as const;
export type KpiRole = typeof KPI_ROLES[number];
export type KpiParticipants = Partial<Record<KpiRole, string[]>>;
export const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

export function resolveKpiSettingsNames(
  employees: { full_name: string; terminated_at: string | null }[],
  legacy: Partial<Record<KpiRole, string[]>>,
  selections: KpiParticipants,
) {
  const names = [
    ...employees.filter(employee => !employee.terminated_at).map(employee => employee.full_name),
    ...KPI_ROLES.flatMap(role => legacy[role] ?? []),
    ...KPI_ROLES.flatMap(role => selections[role] ?? []),
  ];
  return Array.from(new Map(names.filter(name => name.trim()).map(name => [nameKey(name), name.trim()])).values())
    .sort((a, b) => a.localeCompare(b));
}

export function resolveKpiNames(role: KpiRole, participants: KpiParticipants, legacy: string[]) {
  const names = participants[role] ?? legacy;
  return Array.from(new Map(names.filter(n => n.trim()).map(n => [nameKey(n), n.trim()])).values());
}

export function participates(role: KpiRole, participants: KpiParticipants, name: string) {
  return participants[role] === undefined || participants[role]?.some(n => nameKey(n) === nameKey(name)) === true;
}