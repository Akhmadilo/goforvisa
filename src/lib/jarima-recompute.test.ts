import { describe, expect, it } from "vitest";
import { recomputeAllLateFines } from "./jarima.functions";

function mockClient(attendance: any[], schedules: any[], rules: any[]) {
  const upserts: any[] = [];
  const deletes: any[] = [];
  const c = {
    from(table: string) {
      if (table === "attendance") return { select: async () => ({ data: attendance }) };
      if (table === "employee_schedules") return { select: async () => ({ data: schedules }) };
      if (table === "fine_rules")
        return { select: () => ({ order: async () => ({ data: rules }) }) };
      if (table === "fines")
        return {
          upsert: async (row: any) => {
            upserts.push(row);
            return { error: null };
          },
          delete: () => {
            const cond: Record<string, any> = {};
            const chain = {
              eq(col: string, val: any) {
                cond[col] = val;
                return chain;
              },
              then: (resolve: any) => {
                deletes.push(cond);
                return resolve({ error: null });
              },
            };
            return chain;
          },
        };
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { c, upserts, deletes };
}

// 2026-10-05 is a Monday (weekday 1).
const att = (date: string, checkInAt: string) => ({
  employee_id: "emp-1",
  date,
  check_in_at: checkInAt,
});
const sched = {
  employee_id: "emp-1",
  weekday: 1,
  start_time: "10:00",
  is_working: true,
};
const rules = [
  { employee_id: null, min_minutes: 1, max_minutes: 30, amount_uzs: 30000, kind: "late" },
];

describe("recomputeAllLateFines effective_from", () => {
  it("leaves fines before effective_from untouched, recomputes later dates", async () => {
    const { c, upserts, deletes } = mockClient(
      [att("2026-09-28", "2026-09-28T06:00:00Z"), att("2026-10-05", "2026-10-05T06:00:00Z")],
      [{ ...sched, effective_from: "2026-10-01" }],
      rules,
    );
    await recomputeAllLateFines(c);
    expect(upserts.map((u) => u.date)).toEqual(["2026-10-05"]);
    expect(deletes).toEqual([]);
  });

  it("recomputes all dates when effective_from is null", async () => {
    const { c, upserts } = mockClient(
      [att("2026-09-28", "2026-09-28T06:00:00Z"), att("2026-10-05", "2026-10-05T06:00:00Z")],
      [{ ...sched, effective_from: null }],
      rules,
    );
    await recomputeAllLateFines(c);
    expect(upserts.map((u) => u.date)).toEqual(["2026-09-28", "2026-10-05"]);
  });
});
