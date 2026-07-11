import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AdvanceStatus =
  | "pending"
  | "ceo_approved"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled";

export type AdvanceRequest = {
  id: string;
  employee_id: string | null;
  telegram_id: number | null;
  amount_uzs: number;
  purpose: string;
  status: AdvanceStatus;
  ceo_approved_by: string | null;
  ceo_approved_at: string | null;
  ceo_note: string | null;
  finance_approved_by: string | null;
  finance_approved_at: string | null;
  finance_note: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  paid_at: string | null;
  paid_by: string | null;
  deducted_in_salary_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

// ---- Telegram notification helper (server only) ----
async function notifyEmployee(telegramId: number | null, text: string) {
  if (!telegramId) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text }),
    });
  } catch (e) {
    console.error("notifyEmployee failed", e);
  }
}

async function getEmployeeName(c: any, employeeId: string | null): Promise<string> {
  if (!employeeId) return "—";
  const { data } = await c.from("employees").select("full_name").eq("id", employeeId).maybeSingle();
  return (data?.full_name as string) || "—";
}

function fmtUzs(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
}

// ---- List ----
export const listAdvances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("advance_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as AdvanceRequest[];
    const salaryIds = Array.from(new Set(rows.map(r => r.deducted_in_salary_id).filter(Boolean))) as string[];
    let salMap = new Map<string, { year: number; month: number }>();
    if (salaryIds.length) {
      const { data: sals } = await context.supabase
        .from("salaries").select("id, year, month").in("id", salaryIds);
      (sals ?? []).forEach((s: any) => salMap.set(s.id, { year: s.year, month: s.month }));
    }
    return rows.map(r => ({
      ...r,
      deducted_year: r.deducted_in_salary_id ? salMap.get(r.deducted_in_salary_id)?.year ?? null : null,
      deducted_month: r.deducted_in_salary_id ? salMap.get(r.deducted_in_salary_id)?.month ?? null : null,
    })) as (AdvanceRequest & { deducted_year: number | null; deducted_month: number | null })[];
  });


// ---- Create manually (admin/CEO/finance) ----
export const createAdvanceManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; amount: number; purpose: string }) =>
    z.object({
      employeeId: z.string().uuid(),
      amount: z.number().positive().max(1_000_000_000),
      purpose: z.string().trim().min(1).max(500),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("advance_requests").insert({
      employee_id: data.employeeId,
      amount_uzs: data.amount,
      purpose: data.purpose,
      status: "pending",
      source: "manual",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- CEO decision ----
export const ceoDecideAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean; note?: string }) =>
    z.object({
      id: z.string().uuid(),
      approve: z.boolean(),
      note: z.string().max(500).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isCeo } = await c.rpc("has_role", { _user_id: context.userId, _role: "owner_ceo" });
    const { data: isAdminCeo } = await c.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isCeo && !isAdminCeo) throw new Error("Faqat direktor/CEO tasdiqlashi mumkin");
    const { data: row, error: e1 } = await c
      .from("advance_requests").select("*").eq("id", data.id).maybeSingle();
    if (e1 || !row) throw new Error(e1?.message || "So'rov topilmadi");
    if (row.status !== "pending") throw new Error("Bu so'rov allaqachon ko'rib chiqilgan");

    const patch = data.approve
      ? {
          status: "ceo_approved" as const,
          ceo_approved_by: context.userId,
          ceo_approved_at: new Date().toISOString(),
          ceo_note: data.note ?? null,
        }
      : {
          status: "rejected" as const,
          rejected_by: context.userId,
          rejected_at: new Date().toISOString(),
          rejected_reason: data.note ?? "Direktor rad etdi",
        };
    const { error } = await c.from("advance_requests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (!data.approve) {
      await notifyEmployee(
        row.telegram_id,
        `❌ Avans so'rovingiz rad etildi.\n\nSumma: ${fmtUzs(Number(row.amount_uzs))} so'm\nSabab: ${data.note || "—"}`
      );
    }
    return { ok: true };
  });

// ---- Finance decision ----
export const financeDecideAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean; note?: string }) =>
    z.object({
      id: z.string().uuid(),
      approve: z.boolean(),
      note: z.string().max(500).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isFin } = await c.rpc("has_role", { _user_id: context.userId, _role: "financier" });
    const { data: isAdminFin } = await c.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isFin && !isAdminFin) throw new Error("Faqat moliyachi tasdiqlashi mumkin");
    const { data: row, error: e1 } = await c
      .from("advance_requests").select("*").eq("id", data.id).maybeSingle();
    if (e1 || !row) throw new Error(e1?.message || "So'rov topilmadi");
    if (row.status !== "ceo_approved") throw new Error("Avval direktor tasdiqlashi kerak");

    const patch = data.approve
      ? {
          status: "approved" as const,
          finance_approved_by: context.userId,
          finance_approved_at: new Date().toISOString(),
          finance_note: data.note ?? null,
        }
      : {
          status: "rejected" as const,
          rejected_by: context.userId,
          rejected_at: new Date().toISOString(),
          rejected_reason: data.note ?? "Moliyachi rad etdi",
        };
    const { error } = await c.from("advance_requests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (!data.approve) {
      await notifyEmployee(
        row.telegram_id,
        `❌ Avans so'rovingiz rad etildi.\n\nSumma: ${fmtUzs(Number(row.amount_uzs))} so'm\nSabab: ${data.note || "—"}`
      );
    }
    return { ok: true };
  });

// ---- Mark paid + deduct from next salary ----
export const markAdvancePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isFin } = await c.rpc("has_role", { _user_id: context.userId, _role: "financier" });
    const { data: isAdmin } = await c.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isFin && !isAdmin) throw new Error("Faqat moliyachi yoki admin to'lay oladi");
    const { data: row, error: e1 } = await c
      .from("advance_requests").select("*").eq("id", data.id).maybeSingle();
    if (e1 || !row) throw new Error(e1?.message || "So'rov topilmadi");
    if (row.status !== "approved") throw new Error("Avval ikkala tomon tasdiqlashi kerak");
    if (!row.employee_id) throw new Error("Xodim bog'lanmagan");

    // Determine target month (current Tashkent month) and upsert into salaries
    const now = new Date(Date.now() + 5 * 3600 * 1000);
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const empName = await getEmployeeName(c, row.employee_id);

    // Find existing salary row
    const { data: existingSalary } = await c
      .from("salaries")
      .select("id, advance_amount")
      .eq("employee_name", empName)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    let salaryId: string;
    const advance = Number(row.amount_uzs);
    if (existingSalary) {
      const newAmt = Number(existingSalary.advance_amount || 0) + advance;
      const { error } = await c.from("salaries")
        .update({ advance_amount: newAmt })
        .eq("id", existingSalary.id);
      if (error) throw new Error(error.message);
      salaryId = existingSalary.id as string;
    } else {
      const { data: ins, error } = await c.from("salaries").insert({
        employee_name: empName,
        year, month,
        fixed_amount: 0,
        kpi_amount: 0,
        penalty_amount: 0,
        advance_amount: advance,
        note: "Avtomatik: avans ushlanmasi",
        created_by: context.userId,
      }).select("id").maybeSingle();
      if (error || !ins) throw new Error(error?.message || "Oylik yarata olmadim");
      salaryId = ins.id as string;
    }

    const { error: e2 } = await c.from("advance_requests").update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: context.userId,
      deducted_in_salary_id: salaryId,
    }).eq("id", data.id);
    if (e2) throw new Error(e2.message);

    await notifyEmployee(
      row.telegram_id,
      `✅ Avans tasdiqlandi va berildi!\n\nSumma: ${fmtUzs(advance)} so'm\nMaqsad: ${row.purpose}\n\nℹ️ Ushbu summa keyingi oylikingizdan ushlab qolinadi.`
    );

    return { ok: true };
  });

// ---- Admin final decision: approve+pay or reject in one step ----
export const adminFinalizeAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean; note?: string; deductYear?: number; deductMonth?: number }) =>
    z.object({
      id: z.string().uuid(),
      approve: z.boolean(),
      note: z.string().max(500).optional(),
      deductYear: z.number().int().min(2020).max(2100).optional(),
      deductMonth: z.number().int().min(1).max(12).optional(),
    }).parse(d)
  )

  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isAdmin } = await c.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Faqat admin yakuniylashtirishi mumkin");

    const { data: row, error: e1 } = await c
      .from("advance_requests").select("*").eq("id", data.id).maybeSingle();
    if (e1 || !row) throw new Error(e1?.message || "So'rov topilmadi");
    if (row.status !== "ceo_approved") throw new Error("Avval direktor tasdiqlashi kerak");

    if (!data.approve) {
      const { error } = await c.from("advance_requests").update({
        status: "rejected",
        rejected_by: context.userId,
        rejected_at: new Date().toISOString(),
        rejected_reason: data.note ?? "Admin rad etdi",
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      await notifyEmployee(
        row.telegram_id,
        `❌ Avans so'rovingiz rad etildi.\n\nSumma: ${fmtUzs(Number(row.amount_uzs))} so'm\nSabab: ${data.note || "—"}`
      );
      return { ok: true };
    }

    if (!row.employee_id) throw new Error("Xodim bog'lanmagan");

    // Approve: deduct from selected month salary (default = current Tashkent month), mark paid.
    const now = new Date(Date.now() + 5 * 3600 * 1000);
    const year = data.deductYear ?? now.getUTCFullYear();
    const month = data.deductMonth ?? (now.getUTCMonth() + 1);

    const empName = await getEmployeeName(c, row.employee_id);
    const advance = Number(row.amount_uzs);

    const { data: existingSalary } = await c
      .from("salaries")
      .select("id, advance_amount")
      .eq("employee_name", empName)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    let salaryId: string;
    if (existingSalary) {
      const newAmt = Number(existingSalary.advance_amount || 0) + advance;
      const { error } = await c.from("salaries")
        .update({ advance_amount: newAmt })
        .eq("id", existingSalary.id);
      if (error) throw new Error(error.message);
      salaryId = existingSalary.id as string;
    } else {
      const { data: ins, error } = await c.from("salaries").insert({
        employee_name: empName,
        year, month,
        fixed_amount: 0,
        kpi_amount: 0,
        penalty_amount: 0,
        advance_amount: advance,
        note: "Avtomatik: avans ushlanmasi",
        created_by: context.userId,
      }).select("id").maybeSingle();
      if (error || !ins) throw new Error(error?.message || "Oylik yarata olmadim");
      salaryId = ins.id as string;
    }

    const { error: eUp } = await c.from("advance_requests").update({
      status: "paid",
      finance_approved_by: context.userId,
      finance_approved_at: new Date().toISOString(),
      finance_note: data.note ?? null,
      paid_at: new Date().toISOString(),
      paid_by: context.userId,
      deducted_in_salary_id: salaryId,
    }).eq("id", data.id);
    if (eUp) throw new Error(eUp.message);

    await notifyEmployee(
      row.telegram_id,
      `✅ Avans tasdiqlandi va berildi!\n\nSumma: ${fmtUzs(advance)} so'm\nMaqsad: ${row.purpose}\n\nℹ️ Ushbu summa keyingi oylikingizdan ushlab qolinadi.`
    );
    return { ok: true };
  });


// ---- Per-employee attendance & fines for a given month ----
export const getEmployeeMonth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; year: number; month: number }) =>
    z.object({
      employeeId: z.string().uuid(),
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const start = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const endDate = new Date(data.year, data.month, 0).getDate();
    const end = `${data.year}-${String(data.month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;

    const [att, fines, sched, leaves] = await Promise.all([
      context.supabase.from("attendance").select("*")
        .eq("employee_id", data.employeeId)
        .gte("date", start).lte("date", end),
      context.supabase.from("fines").select("*")
        .eq("employee_id", data.employeeId)
        .gte("date", start).lte("date", end),
      context.supabase.from("employee_schedules").select("*")
        .eq("employee_id", data.employeeId),
      context.supabase.from("leave_requests").select("date, status, reason, note")
        .eq("employee_id", data.employeeId)
        .eq("status", "approved")
        .gte("date", start).lte("date", end),
    ]);

    return {
      attendance: (att.data ?? []) as any[],
      fines: (fines.data ?? []) as any[],
      schedules: (sched.data ?? []) as any[],
      leaves: (leaves.data ?? []) as any[],
      daysInMonth: endDate,
    };
  });
