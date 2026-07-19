import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TelegramBotRole = "none" | "owner" | "ceo" | "financier" | "director" | "finance";

export type TelegramLink = {
  id: string;
  employee_id: string | null;
  telegram_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  linked_at: string | null;
  bot_role: TelegramBotRole;
};

export type Schedule = {
  id: string;
  employee_id: string;
  weekday: number;
  start_time: string;
  is_working: boolean;
};

export type FineRule = {
  id: string;
  employee_id: string | null;
  min_minutes: number | null;
  max_minutes: number | null;
  amount_uzs: number;
  label: string | null;
  kind: "late" | "absence";
};

export type AttendanceRow = {
  id: string;
  employee_id: string;
  date: string;
  check_in_at: string;
  face_id_confirmed: boolean;
};

export type FineRow = {
  id: string;
  employee_id: string;
  date: string;
  minutes_late: number;
  amount_uzs: number;
  reason: string;
  note: string | null;
};

export const getJarimaData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context.supabase;
    const [tg, sch, rules, att, fines] = await Promise.all([
      c.from("employee_telegram").select("*").order("created_at", { ascending: false }),
      c.from("employee_schedules").select("*"),
      c.from("fine_rules").select("*").order("min_minutes", { ascending: true }),
      c.from("attendance").select("*").order("check_in_at", { ascending: false }).limit(500),
      c.from("fines").select("*").order("date", { ascending: false }).limit(500),
    ]);
    return {
      telegram: (tg.data || []) as TelegramLink[],
      schedules: (sch.data || []) as Schedule[],
      rules: (rules.data || []) as FineRule[],
      attendance: (att.data || []) as AttendanceRow[],
      fines: (fines.data || []) as FineRow[],
    };
  });

const NO_REPORT_REASON = "Hisobot yozmagan";
const NO_REPORT_AMOUNT = 20000;

export type MissingReportRow = {
  employee_id: string;
  employee_name: string;
  date: string;
  already_fined: boolean;
};

// Compute (and optionally persist) fines for working days without a work_report.
// Rule: 20 000 so'm per missing day, only for past days (today excluded), skipping Sundays and non-working days.
export const syncMissingReportFines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number; persist?: boolean }) =>
    z.object({
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
      persist: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { year, month, persist } = data;
    const daysInMonth = new Date(year, month, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${year}-${pad(month)}-01`;
    const end = `${year}-${pad(month)}-${pad(daysInMonth)}`;

    // "today" in Tashkent (UTC+5)
    const nowTk = new Date(Date.now() + 5 * 3600 * 1000);
    const todayStr = nowTk.toISOString().slice(0, 10);

    const [empRes, schRes, wrRes, fineRes] = await Promise.all([
      c.from("employees").select("id, full_name, terminated_at, created_at, report_required").is("terminated_at", null),
      c.from("employee_schedules").select("employee_id, weekday, is_working"),
      c.from("work_reports").select("employee_id, date").gte("date", start).lte("date", end),
      c.from("fines").select("employee_id, date, reason").eq("reason", NO_REPORT_REASON).gte("date", start).lte("date", end),
    ]);
    if (empRes.error) throw new Error(empRes.error.message);

    const employees = ((empRes.data || []) as { id: string; full_name: string; created_at: string; report_required: boolean | null }[])
      .filter(e => e.report_required !== false);

    const employees = (empRes.data || []) as { id: string; full_name: string; created_at: string }[];
    const schedules = (schRes.data || []) as { employee_id: string; weekday: number; is_working: boolean }[];
    const reports = (wrRes.data || []) as { employee_id: string; date: string }[];
    const existing = (fineRes.data || []) as { employee_id: string; date: string }[];

    // schedule lookup: key = `${emp}-${weekday}` (weekday 0=Sun..6=Sat)
    const schMap = new Map<string, boolean>();
    for (const s of schedules) schMap.set(`${s.employee_id}-${s.weekday}`, s.is_working);
    const reportSet = new Set(reports.map(r => `${r.employee_id}-${r.date}`));
    const existingSet = new Set(existing.map(f => `${f.employee_id}-${f.date}`));

    const missing: MissingReportRow[] = [];
    const toInsert: { employee_id: string; date: string; amount_uzs: number; minutes_late: number; reason: string }[] = [];

    for (const emp of employees) {
      const empStart = emp.created_at ? emp.created_at.slice(0, 10) : start;
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${pad(month)}-${pad(day)}`;
        if (dateStr >= todayStr) break; // only past days
        if (dateStr < empStart) continue;
        const wd = new Date(`${dateStr}T00:00:00`).getDay();
        if (wd === 0) continue; // Sunday off
        const schKey = `${emp.id}-${wd}`;
        if (schMap.has(schKey) && schMap.get(schKey) === false) continue;
        if (reportSet.has(`${emp.id}-${dateStr}`)) continue;
        const key = `${emp.id}-${dateStr}`;
        const already = existingSet.has(key);
        missing.push({ employee_id: emp.id, employee_name: emp.full_name, date: dateStr, already_fined: already });
        if (!already) {
          toInsert.push({
            employee_id: emp.id,
            date: dateStr,
            amount_uzs: NO_REPORT_AMOUNT,
            minutes_late: 0,
            reason: NO_REPORT_REASON,
          });
        }
      }
    }

    let inserted = 0;
    if (persist && toInsert.length > 0) {
      const { error, data: ins } = await c.from("fines").insert(toInsert).select("id");
      if (error) throw new Error(error.message);
      inserted = ins?.length ?? toInsert.length;
    }

    return {
      missing,
      pending: toInsert.length,
      inserted,
      amount_per_day: NO_REPORT_AMOUNT,
    };
  });

export const linkTelegramToEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { telegramRowId: string; employeeId: string | null }) =>
    z.object({ telegramRowId: z.string().uuid(), employeeId: z.string().uuid().nullable() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("employee_telegram")
      .update({
        employee_id: data.employeeId,
        linked_at: data.employeeId ? new Date().toISOString() : null,
      })
      .eq("id", data.telegramRowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTelegramBotRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { telegramRowId: string; botRole: TelegramBotRole }) =>
    z.object({
      telegramRowId: z.string().uuid(),
      botRole: z.enum(["none", "owner", "ceo", "financier", "director", "finance"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("employee_telegram")
      .update({ bot_role: data.botRole })
      .eq("id", data.telegramRowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; weekday: number; startTime: string; isWorking: boolean }) =>
    z.object({
      employeeId: z.string().uuid(),
      weekday: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      isWorking: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const c: any = context.supabase;
    const { error } = await c
      .from("employee_schedules")
      .upsert({
        employee_id: data.employeeId,
        weekday: data.weekday,
        start_time: data.startTime,
        is_working: data.isWorking,
      }, { onConflict: "employee_id,weekday" });
    if (error) throw new Error(error.message);

    // Recompute fines for all past attendance of this employee on this weekday
    const { data: attRows } = await c
      .from("attendance")
      .select("date, check_in_at")
      .eq("employee_id", data.employeeId);

    const { data: empRules } = await c
      .from("fine_rules")
      .select("min_minutes, max_minutes, amount_uzs, kind, employee_id")
      .or(`employee_id.eq.${data.employeeId},employee_id.is.null`)
      .order("min_minutes", { ascending: true });
    const empLate = (empRules || []).filter((r: any) => (r.kind || "late") === "late" && r.employee_id === data.employeeId);
    const rules = empLate.length > 0 ? empLate : (empRules || []).filter((r: any) => (r.kind || "late") === "late" && r.employee_id == null);

    for (const a of attRows || []) {
      const wd = new Date(`${a.date}T00:00:00Z`).getUTCDay();
      if (wd !== data.weekday) continue;

      let minutesLate = 0;
      if (data.isWorking) {
        // Tashkent local time (UTC+5) arrival
        const arrival = new Date(new Date(a.check_in_at).getTime() + 5 * 3600 * 1000);
        const arrivalMin = arrival.getUTCHours() * 60 + arrival.getUTCMinutes();
        const [sh, sm] = data.startTime.split(":").map(Number);
        const startMin = sh * 60 + sm;
        minutesLate = Math.max(0, arrivalMin - startMin);
      }

      if (minutesLate > 0) {
        let amount = 0;
        for (const r of rules || []) {
          if (r.kind && r.kind !== "late") continue;
          if (
            minutesLate >= Number(r.min_minutes) &&
            (r.max_minutes == null || minutesLate <= Number(r.max_minutes))
          ) {
            amount = Number(r.amount_uzs);
          }
        }
        await c.from("fines").upsert(
          {
            employee_id: data.employeeId,
            date: a.date,
            minutes_late: minutesLate,
            amount_uzs: amount,
            reason: "late",
          },
          { onConflict: "employee_id,date,reason" },
        );
      } else {
        await c.from("fines")
          .delete()
          .eq("employee_id", data.employeeId)
          .eq("date", a.date)
          .eq("reason", "late");
      }
    }

    return { ok: true };
  });

async function recomputeAllLateFines(c: any) {
  // Recompute late fines using per-employee rules (fallback to global rules where employee_id IS NULL).
  const { data: atts } = await c
    .from("attendance")
    .select("employee_id, date, check_in_at");
  const { data: scheds } = await c
    .from("employee_schedules")
    .select("employee_id, weekday, start_time, is_working");
  const { data: rules } = await c
    .from("fine_rules")
    .select("employee_id, min_minutes, max_minutes, amount_uzs, kind")
    .order("min_minutes", { ascending: true });

  const schedMap = new Map<string, any>();
  (scheds || []).forEach((s: any) => schedMap.set(`${s.employee_id}_${s.weekday}`, s));

  const globalLate = (rules || []).filter((r: any) => (r.kind || "late") === "late" && r.employee_id == null);
  const empLateMap = new Map<string, any[]>();
  for (const r of rules || []) {
    if ((r.kind || "late") !== "late") continue;
    if (!r.employee_id) continue;
    const arr = empLateMap.get(r.employee_id) || [];
    arr.push(r);
    empLateMap.set(r.employee_id, arr);
  }

  for (const a of atts || []) {
    const arrival = new Date(new Date(a.check_in_at).getTime() + 5 * 3600 * 1000);
    const wd = new Date(`${a.date}T00:00:00Z`).getUTCDay();
    const sched = schedMap.get(`${a.employee_id}_${wd}`);
    const isWorking = sched ? sched.is_working !== false : true;
    const startStr: string = (sched?.start_time as string) || "10:00";
    const [sh, sm] = startStr.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const arrMin = arrival.getUTCHours() * 60 + arrival.getUTCMinutes();
    const lateMin = isWorking ? Math.max(0, arrMin - startMin) : 0;
    if (lateMin > 0) {
      const empRules = empLateMap.get(a.employee_id);
      const applicable = empRules && empRules.length > 0 ? empRules : globalLate;
      let amount = 0;
      for (const r of applicable) {
        if (lateMin >= Number(r.min_minutes) && (r.max_minutes == null || lateMin <= Number(r.max_minutes))) {
          amount = Number(r.amount_uzs);
        }
      }
      await c.from("fines").upsert({
        employee_id: a.employee_id,
        date: a.date,
        minutes_late: lateMin,
        amount_uzs: amount,
        reason: "late",
      }, { onConflict: "employee_id,date,reason" });
    } else {
      await c.from("fines").delete()
        .eq("employee_id", a.employee_id)
        .eq("date", a.date)
        .eq("reason", "late");
    }
  }
}

export const saveFineRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; employeeId?: string | null; min: number | null; max: number | null; amount: number; label: string | null; kind?: "late" | "absence" }) =>
    z.object({
      id: z.string().uuid().optional(),
      employeeId: z.string().uuid().nullable().optional(),
      min: z.number().int().min(0).nullable(),
      max: z.number().int().nullable(),
      amount: z.number().min(0),
      label: z.string().nullable(),
      kind: z.enum(["late", "absence"]).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const kind = data.kind || "late";
    const row: any = {
      employee_id: data.employeeId ?? null,
      min_minutes: kind === "absence" ? null : (data.min ?? 0),
      max_minutes: data.max,
      amount_uzs: data.amount,
      label: data.label,
      kind,
    };
    if (data.id) {
      const { error } = await context.supabase.from("fine_rules").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("fine_rules").insert(row);
      if (error) throw new Error(error.message);
    }
    if (kind === "late") {
      await recomputeAllLateFines(context.supabase);
    }
    return { ok: true };
  });

export const deleteFineRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c: any = context.supabase;
    const { data: row } = await c.from("fine_rules").select("kind").eq("id", data.id).maybeSingle();
    const { error } = await c.from("fine_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!row || row.kind === "late" || !row.kind) {
      await recomputeAllLateFines(c);
    }
    return { ok: true };
  });

// Update attendance check-in time (financier/admin only) — recomputes fine
export const updateAttendanceCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; date: string; checkInLocal: string }) =>
    z.object({
      employeeId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      checkInLocal: z.string().regex(/^\d{2}:\d{2}$/),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const c: any = context.supabase;

    // Verify caller is admin or financier
    const { data: roles } = await c
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleSet = new Set((roles || []).map((r: any) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("financier")) {
      throw new Error("Faqat Admin yoki Moliyachi tahrirlay oladi");
    }

    // Build UTC ISO from local Tashkent time (UTC+5)
    const [hh, mm] = data.checkInLocal.split(":").map(Number);
    const localMs = Date.UTC(
      Number(data.date.slice(0, 4)),
      Number(data.date.slice(5, 7)) - 1,
      Number(data.date.slice(8, 10)),
      hh,
      mm,
      0,
    );
    const utcIso = new Date(localMs - 5 * 3600 * 1000).toISOString();

    // Upsert attendance
    const { error: upErr } = await c.from("attendance").upsert(
      {
        employee_id: data.employeeId,
        date: data.date,
        check_in_at: utcIso,
        source: "manual",
      },
      { onConflict: "employee_id,date" },
    );
    if (upErr) throw new Error(upErr.message);

    // Resolve weekday schedule to compute minutes_late
    const wd = new Date(`${data.date}T00:00:00Z`).getUTCDay();
    const { data: sched } = await c
      .from("employee_schedules")
      .select("start_time, is_working")
      .eq("employee_id", data.employeeId)
      .eq("weekday", wd)
      .maybeSingle();

    let minutesLate = 0;
    const isWorking = sched ? sched.is_working !== false : true;
    const startStr = (sched?.start_time as string) || "10:00";
    if (isWorking) {
      const [sh, sm] = String(startStr).split(":").map(Number);
      const startMin = sh * 60 + sm;
      const arrivalMin = hh * 60 + mm;
      minutesLate = Math.max(0, arrivalMin - startMin);
    }

    if (minutesLate > 0) {
      const { data: empRules } = await c
        .from("fine_rules")
        .select("min_minutes, max_minutes, amount_uzs, kind")
        .eq("employee_id", data.employeeId)
        .order("min_minutes", { ascending: true });
      let useRules = (empRules || []).filter((r: any) => (r.kind || "late") === "late");
      if (useRules.length === 0) {
        const { data: globalRules } = await c
          .from("fine_rules")
          .select("min_minutes, max_minutes, amount_uzs, kind")
          .is("employee_id", null)
          .order("min_minutes", { ascending: true });
        useRules = (globalRules || []).filter((r: any) => (r.kind || "late") === "late");
      }
      let amount = 0;
      for (const r of useRules) {
        if (
          minutesLate >= Number(r.min_minutes) &&
          (r.max_minutes == null || minutesLate <= Number(r.max_minutes))
        ) {
          amount = Number(r.amount_uzs);
        }
      }
      const { error: fErr } = await c.from("fines").upsert(
        {
          employee_id: data.employeeId,
          date: data.date,
          minutes_late: minutesLate,
          amount_uzs: amount,
          reason: "late",
        },
        { onConflict: "employee_id,date,reason" },
      );
      if (fErr) throw new Error(fErr.message);
    } else {
      // No longer late — remove any prior 'late' fine for that day
      await c
        .from("fines")
        .delete()
        .eq("employee_id", data.employeeId)
        .eq("date", data.date)
        .eq("reason", "late");
    }

    return { ok: true, minutesLate };
  });

// Add/edit an "absent" fine (financier/admin only)
export const setAbsenceFine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; date: string; amountUzs: number; note?: string | null }) =>
    z.object({
      employeeId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amountUzs: z.number().min(0),
      note: z.string().nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const c: any = context.supabase;
    const { data: roles } = await c.from("user_roles").select("role").eq("user_id", context.userId);
    const set = new Set((roles || []).map((r: any) => r.role));
    if (!set.has("admin") && !set.has("financier")) {
      throw new Error("Faqat Admin yoki Moliyachi kirita oladi");
    }

    // Remove any attendance for that day (employee was absent)
    await c.from("attendance")
      .delete()
      .eq("employee_id", data.employeeId)
      .eq("date", data.date);

    // Remove any 'late' fine for the day
    await c.from("fines")
      .delete()
      .eq("employee_id", data.employeeId)
      .eq("date", data.date)
      .eq("reason", "late");

    if (data.amountUzs > 0) {
      const { error } = await c.from("fines").upsert(
        {
          employee_id: data.employeeId,
          date: data.date,
          minutes_late: 0,
          amount_uzs: data.amountUzs,
          reason: "absent",
          note: data.note ?? null,
        },
        { onConflict: "employee_id,date,reason" },
      );
      if (error) throw new Error(error.message);
    } else {
      await c.from("fines")
        .delete()
        .eq("employee_id", data.employeeId)
        .eq("date", data.date)
        .eq("reason", "absent");
    }
    return { ok: true };
  });

// Clear a day completely (remove attendance + fines) — admin/financier
export const clearDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; date: string }) =>
    z.object({
      employeeId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const c: any = context.supabase;
    const { data: roles } = await c.from("user_roles").select("role").eq("user_id", context.userId);
    const set = new Set((roles || []).map((r: any) => r.role));
    if (!set.has("admin") && !set.has("financier")) {
      throw new Error("Faqat Admin yoki Moliyachi");
    }
    await c.from("attendance").delete().eq("employee_id", data.employeeId).eq("date", data.date);
    await c.from("fines").delete().eq("employee_id", data.employeeId).eq("date", data.date);
    return { ok: true };
  });
