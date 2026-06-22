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
  min_minutes: number;
  max_minutes: number | null;
  amount_uzs: number;
  label: string | null;
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
      botRole: z.enum(["none", "director", "finance"]),
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
    const { error } = await context.supabase
      .from("employee_schedules")
      .upsert({
        employee_id: data.employeeId,
        weekday: data.weekday,
        start_time: data.startTime,
        is_working: data.isWorking,
      }, { onConflict: "employee_id,weekday" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveFineRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; min: number; max: number | null; amount: number; label: string | null }) =>
    z.object({
      id: z.string().uuid().optional(),
      min: z.number().int().min(0),
      max: z.number().int().nullable(),
      amount: z.number().min(0),
      label: z.string().nullable(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase.from("fine_rules").update({
        min_minutes: data.min, max_minutes: data.max, amount_uzs: data.amount, label: data.label,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("fine_rules").insert({
        min_minutes: data.min, max_minutes: data.max, amount_uzs: data.amount, label: data.label,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteFineRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fine_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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
    if (sched?.is_working !== false && sched?.start_time) {
      const [sh, sm] = String(sched.start_time).split(":").map(Number);
      const startMin = sh * 60 + sm;
      const arrivalMin = hh * 60 + mm;
      minutesLate = Math.max(0, arrivalMin - startMin);
    }

    if (minutesLate > 0) {
      const { data: rules } = await c
        .from("fine_rules")
        .select("min_minutes, max_minutes, amount_uzs")
        .order("min_minutes", { ascending: true });
      let amount = 0;
      for (const r of rules || []) {
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
