export const KPI_ROLES = ["sales", "back_office", "call_centre", "visa_bonus"] as const;
export type KpiRole = typeof KPI_ROLES[number];
export type KpiParticipants = Partial<Record<KpiRole, string[]>>;
export const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

export function resolveKpiNames(role: KpiRole, participants: KpiParticipants, legacy: string[]) {
  const names = participants[role] ?? legacy;
  return Array.from(new Map(names.filter(n => n.trim()).map(n => [nameKey(n), n.trim()])).values());
}

export function participates(role: KpiRole, participants: KpiParticipants, name: string) {
  return participants[role] === undefined || participants[role]?.some(n => nameKey(n) === nameKey(name)) === true;
}