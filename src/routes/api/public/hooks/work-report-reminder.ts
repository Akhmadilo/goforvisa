import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function todayDate(): string {
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function tg(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

const CEO_ROLES = ["owner", "ceo", "director", "financier"];

export const Route = createFileRoute("/api/public/hooks/work-report-reminder")({
  server: {
    handlers: {
      POST: async () => {
        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const date = todayDate();

        // Find all linked employees who are regular workers (not CEO/director/owner/financier)
        const { data: links } = await sb
          .from("employee_telegram")
          .select("telegram_id, employee_id, bot_role")
          .not("employee_id", "is", null);

        const regular = (links || []).filter(
          (l: any) => !l.bot_role || !CEO_ROLES.includes(l.bot_role),
        );
        if (regular.length === 0) {
          return Response.json({ ok: true, sent: 0, date });
        }

        const empIds = regular.map((l: any) => l.employee_id);

        // Skip terminated employees
        const { data: emps } = await sb
          .from("employees")
          .select("id, terminated_at")
          .in("id", empIds);
        const activeIds = new Set(
          (emps || []).filter((e: any) => !e.terminated_at).map((e: any) => e.id),
        );

        // Find who already submitted today
        const { data: done } = await sb
          .from("work_reports")
          .select("employee_id")
          .eq("date", date)
          .in("employee_id", empIds);
        const doneSet = new Set((done || []).map((d: any) => d.employee_id));

        const toRemind = regular.filter(
          (l: any) => activeIds.has(l.employee_id) && !doneSet.has(l.employee_id),
        );

        let sent = 0;
        for (const r of toRemind) {
          const res: any = await tg("sendMessage", {
            chat_id: r.telegram_id,
            text:
              "⏰ Iltimos, bugungi bajarilgan ishlaringizni kiritishni unutmang.\n\n" +
              "📋 \"Bajarilgan ishlar\" tugmasini bosib hisobotni yuboring.",
            reply_markup: {
              keyboard: [
                [{ text: "🟢 Keldim" }],
                [{ text: "💰 Avans so'rash" }, { text: "📅 Javob so'rash" }],
                [{ text: "📋 Bajarilgan ishlar" }],
              ],
              resize_keyboard: true,
            },
          });
          if (res?.ok) sent++;
        }

        return Response.json({ ok: true, date, candidates: toRemind.length, sent });
      },
    },
  },
});
