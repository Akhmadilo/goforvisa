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
  if (!m) return "❔ Noma'lum";
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

        const { data: groups } = await sb
          .from("telegram_groups")
          .select("chat_id, tenant_id, title")
          .eq("kind", "daily_cash")
          .eq("is_active", true);

        if (!groups || groups.length === 0) {
          return Response.json({ ok: true, sent: 0, date, reason: "no groups" });
        }

        let sent = 0;
        for (const g of groups as any[]) {
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

          const header = `📊 <b>Kunlik kassa hisoboti</b>\n🗓 ${date}\n\n`;
          const body =
            rows.length === 0
              ? "Bugun to'lov qabul qilinmadi."
              : lines.join("\n") +
                `\n\n<b>Jami:</b> ${totalUzs > 0 ? fmt(totalUzs) + " so'm" : ""}${
                  totalUzs > 0 && totalUsd > 0 ? " + " : ""
                }${totalUsd > 0 ? "$" + fmt(totalUsd) : ""}${
                  totalUzs === 0 && totalUsd === 0 ? "0" : ""
                }\n<b>To'lovlar soni:</b> ${rows.length}`;

          const text = header + body + "\n\nIltimos, tasdiqlang 👇";

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
