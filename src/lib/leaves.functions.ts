import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CEO_ROLES = ["owner", "ceo", "director"] as const;

function leaveDecisionKb(id: string) {
  return {
    inline_keyboard: [
      [{ text: "✅ Tasdiq + oylik hisoblansin", callback_data: `lv_ac_${id}` }],
      [{ text: "✅ Tasdiq + oylik hisoblanmasin", callback_data: `lv_an_${id}` }],
      [{ text: "❌ Rad etish", callback_data: `lv_rj_${id}` }],
    ],
  };
}

async function tg(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false };
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export const createLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employeeId: string; date: string; reason?: string }) =>
    z.object({
      employeeId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().max(1000).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: ins, error } = await c
      .from("leave_requests")
      .insert({
        employee_id: data.employeeId,
        date: data.date,
        reason: data.reason?.trim() || null,
        status: "pending",
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if (error || !ins) throw new Error(error?.message || "Yarata olmadim");

    // Notify CEO/director via Telegram (best-effort, uses admin client)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: emp } = await supabaseAdmin
        .from("employees").select("full_name").eq("id", data.employeeId).maybeSingle();
      const { data: dirs } = await supabaseAdmin
        .from("employee_telegram").select("telegram_id").in("bot_role", CEO_ROLES);
      const text = `📅 *Yangi dam olish so'rovi*\n\n👤 Ishchi: ${emp?.full_name || "—"}\n📆 Sana: ${data.date}\n📝 Sabab: ${data.reason?.trim() || "—"}`;
      const messages: Array<{ chat_id: number; message_id: number }> = [];
      for (const d of dirs || []) {
        const r: any = await tg("sendMessage", {
          chat_id: d.telegram_id,
          text,
          parse_mode: "Markdown",
          reply_markup: leaveDecisionKb(ins.id as string),
        });
        if (r?.ok && r.result?.message_id) {
          messages.push({ chat_id: d.telegram_id, message_id: r.result.message_id });
        }
      }
      if (messages.length) {
        await supabaseAdmin.from("leave_requests")
          .update({ notif_messages: messages }).eq("id", ins.id);
      }
    } catch (e) {
      console.error("notifyDirectorsAboutLeave failed", e);
    }

    return { ok: true, id: ins.id };
  });
