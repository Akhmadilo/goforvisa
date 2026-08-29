import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function todayDate(): string {
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number): string {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
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

const METHOD_LABEL: Record<string, string> = {
  cash: "💵 Naqd",
  naqd: "💵 Naqd",
  card: "💳 Karta",
  plastik: "💳 Karta",
  bank: "🏦 Bank",
  transfer: "🏦 O'tkazma",
};

function methodLabel(m: string | null): string {
  if (!m) return "💵 Naqd";
  return METHOD_LABEL[m.toLowerCase().trim()] || m;
}

export const Route = createFileRoute("/api/public/hooks/daily-cash-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided =
          request.headers.get("apikey") || request.headers.get("x-hook-secret") || "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const date = todayDate();
        const nowTashkentHour = new Date(Date.now() + 5 * 3600 * 1000).getUTCHours();
        const force = new URL(request.url).searchParams.get("force") === "1";

        const { data: groups } = await sb
          .from("telegram_groups")
          .select("chat_id, tenant_id, title")
          .eq("kind", "daily_cash")
          .eq("is_active", true);

        if (!groups || groups.length === 0) {
          return Response.json({ ok: true, sent: 0, date, reason: "no groups" });
        }

        const { data: allSettings } = await sb
          .from("bot_settings")
          .select("tenant_id, daily_report_enabled, daily_report_hour, mention_bosses");
        const settingsMap = new Map<string, any>(
          ((allSettings || []) as any[]).map((s) => [s.tenant_id, s]),
        );

        let sent = 0;
        for (const g of groups as any[]) {
          const cfg = settingsMap.get(g.tenant_id);
          if (!force) {
            if (cfg?.daily_report_enabled === false) continue;
            // Hook is invoked hourly; only the tenant's configured hour sends (default 21:00)
            const targetHour =
              typeof cfg?.daily_report_hour === "number" ? cfg.daily_report_hour : 21;
            if (targetHour !== nowTashkentHour) continue;
          }

          const { data: pays } = await sb
            .from("contract_payments")
            .select("amount, currency, method, note, contract_id, created_at")
            .eq("tenant_id", g.tenant_id)
            .eq("paid_at", date)
            .order("created_at", { ascending: true });

          const rows = (pays || []) as any[];
          const ids = Array.from(new Set(rows.map((p) => p.contract_id)));
          let names: Record<string, string> = {};
          if (ids.length) {
            const { data: ctrs } = await sb
              .from("contracts")
              .select("id, client_name, contract_no")
              .in("id", ids);
            for (const c of (ctrs || []) as any[]) {
              names[c.id] = c.client_name + (c.contract_no ? ` (№${c.contract_no})` : "");
            }
          }

          let totalUzs = 0;
          let totalUsd = 0;
          const lines: string[] = [];
          const details: any[] = [];
          rows.forEach((p, i) => {
            const cur = (p.currency || "UZS").toUpperCase();
            const amt = Number(p.amount) || 0;
            if (cur === "USD") totalUsd += amt;
            else totalUzs += amt;
            const client = names[p.contract_id] || "Noma'lum mijoz";
            const sum = cur === "USD" ? `$${fmt(amt)}` : `${fmt(amt)} so'm`;
            lines.push(`${i + 1}. ${client}\n    ${sum} — ${methodLabel(p.method)}`);
            details.push({ client, amount: amt, currency: cur, method: p.method });
          });

          const isEmpty = rows.length === 0;
          const header = isEmpty
            ? `📭 <b>Kunlik kassa hisoboti</b>\n🗓 ${date}\n\n`
            : `📊 <b>Kunlik kassa hisoboti</b>\n🗓 ${date}\n\n`;
          const body = isEmpty
            ? "❗️ <b>Bugun to'lov qabul qilinmadi.</b>\n\n<b>Jami:</b> 0\n<b>To'lovlar soni:</b> 0"
            : lines.join("\n") +
              `\n\n<b>Jami:</b> ${totalUzs > 0 ? fmt(totalUzs) + " so'm" : ""}${
                totalUzs > 0 && totalUsd > 0 ? " + " : ""
              }${totalUsd > 0 ? "$" + fmt(totalUsd) : ""}${
                totalUzs === 0 && totalUsd === 0 ? "0" : ""
              }\n<b>To'lovlar soni:</b> ${rows.length}`;

          // rahbariyatni (CEO / owner) otmetka qilish (Bot bo'limida o'chirish mumkin)
          const wantMentions = cfg?.mention_bosses !== false;
          const { data: bosses } = wantMentions
            ? await sb
                .from("employee_telegram")
                .select("telegram_id, telegram_username, first_name, last_name")
                .eq("tenant_id", g.tenant_id)
                .in("bot_role", ["ceo", "owner"])
            : { data: [] as any[] };



          const mentions = ((bosses || []) as any[])
            .map((b) => {
              const nm =
                [b.first_name, b.last_name].filter(Boolean).join(" ").trim() ||
                b.telegram_username ||
                "Rahbar";
              return b.telegram_username
                ? `@${b.telegram_username}`
                : `<a href="tg://user?id=${b.telegram_id}">${nm}</a>`;
            })
            .join(" ");

          const text =
            header +
            body +
            (mentions ? `\n\n${mentions}` : "") +
            "\n\nIltimos, tasdiqlang 👇";

          // upsert report row first (need id for callback data)
          const { data: rep } = await sb
            .from("daily_cash_reports")
            .upsert(
              {
                tenant_id: g.tenant_id,
                chat_id: g.chat_id,
                date,
                total_uzs: totalUzs,
                total_usd: totalUsd,
                payments_count: rows.length,
                details,
                status: "pending",
                message_id: null,
                decided_by_tg: null,
                decided_by_name: null,
                decided_at: null,
              },
              { onConflict: "chat_id,date" },
            )
            .select("id")
            .single();

          if (!rep) continue;

          const res: any = await tg("sendMessage", {
            chat_id: g.chat_id,
            text,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Qabul qildim", callback_data: `cash_ok_${rep.id}` },
                  { text: "❌ Noto'g'ri", callback_data: `cash_no_${rep.id}` },
                ],
              ],
            },
          });

          if (res?.ok) {
            sent++;
            await sb
              .from("daily_cash_reports")
              .update({ message_id: res.result.message_id })
              .eq("id", rep.id);
          }
        }

        return Response.json({ ok: true, date, groups: groups.length, sent });
      },
    },
  },
});
