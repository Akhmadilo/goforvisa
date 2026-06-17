import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TelegramLink = {
  id: string;
  employee_id: string | null;
  telegram_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  linked_at: string | null;
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
