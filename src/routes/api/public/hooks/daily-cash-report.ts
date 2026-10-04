import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "@/lib/cron-auth.server";

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
        // Private cron secret (never shipped to the browser).
        if (!(await verifyCronSecret(request))) {
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
            .select("amount, currency, method, note, contract_id, created_at, received_by")
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

          const isCard = (m: string | null) => {
            const k = (m || "").toLowerCase().trim();
            return k === "card" || k === "plastik" || k === "karta";
          };
          const isCashM = (m: string | null) => {
            const k = (m || "").toLowerCase().trim();
            return !k || k === "cash" || k === "naqd";
          };
          const money = (uzs: number, usd: number) =>
            [uzs ? `${fmt(uzs)} so'm` : "", usd ? `$${fmt(usd)}` : ""].filter(Boolean).join(" + ") || "0";

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

          // Qabul qiluvchining o'zini alohida otmetka qilish uchun ro'yxat
          const { data: tgUsers } = await sb
            .from("employee_telegram")
            .select("telegram_id, telegram_username, first_name, last_name, employees(full_name)")
            .eq("tenant_id", g.tenant_id);

          const norm = (s: string) =>
            (s || "")
              .toLowerCase()
              .replace(/kh/g, "h")
              .replace(/[^a-zа-яё\s]/gi, "")
              .trim();

          const mentionFor = (receiver: string): string => {
            const key = norm(receiver);
            if (!key) return "";
            const first = key.split(/\s+/)[0];
            if (first.length < 3) return "";
            // Faqat ism aniq mos kelsa otmetka qilamiz (bo'sh/qisman moslik boshqa odamni belgilab qo'ymasin)
            const hit = ((tgUsers || []) as any[]).find((u) => {
              const pool = [
                u.employees?.full_name,
                [u.first_name, u.last_name].filter(Boolean).join(" "),
                u.telegram_username,
              ]
                .filter(Boolean)
                .map((x: string) => norm(x))
                .filter((x: string) => x.length > 0);
              return pool.some((p) => p.split(/\s+/).includes(first));
            });
            if (!hit) return "";
            const nm =
              hit.employees?.full_name ||
              [hit.first_name, hit.last_name].filter(Boolean).join(" ").trim() ||
              receiver;
            return hit.telegram_username
              ? `@${hit.telegram_username}`
              : `<a href="tg://user?id=${hit.telegram_id}">${nm}</a>`;
          };


          // Har bir qabul qiluvchi uchun alohida guruh
          const byRecv = new Map<string, any[]>();
          for (const p of rows) {
            const recv = (p.received_by || "").trim() || "Belgilanmagan";
            const arr = byRecv.get(recv) || [];
            arr.push(p);
            byRecv.set(recv, arr);
          }

          type Blk = { receiver: string; text: string; totalUzs: number; totalUsd: number; count: number; details: any[] };
          const blocks: Blk[] = [];

          if (rows.length === 0) {
            blocks.push({
              receiver: "",
              text:
                `📭 <b>Kunlik kassa hisoboti</b>\n🗓 ${date}\n\n` +
                "❗️ <b>Bugun to'lov qabul qilinmadi.</b>\n\n<b>Jami:</b> 0\n<b>To'lovlar soni:</b> 0",
              totalUzs: 0,
              totalUsd: 0,
              count: 0,
              details: [],
            });
          } else {
            for (const [recv, list] of byRecv.entries()) {
              let tUzs = 0;
              let tUsd = 0;
              let cashUzs = 0, cashUsd = 0, cardUzs = 0, cardUsd = 0, othUzs = 0, othUsd = 0;
              const lines: string[] = [];
              const details: any[] = [];
              list.forEach((p, i) => {
                const cur = (p.currency || "UZS").toUpperCase();
                const amt = Number(p.amount) || 0;
                const usd = cur === "USD";
                if (usd) tUsd += amt; else tUzs += amt;
                if (isCard(p.method)) usd ? (cardUsd += amt) : (cardUzs += amt);
                else if (isCashM(p.method)) usd ? (cashUsd += amt) : (cashUzs += amt);
                else usd ? (othUsd += amt) : (othUzs += amt);
                const client = names[p.contract_id] || "Noma'lum mijoz";
                const sum = usd ? `$${fmt(amt)}` : `${fmt(amt)} so'm`;
                lines.push(`${i + 1}. ${client}\n    ${sum} — ${methodLabel(p.method)}`);
                details.push({ client, amount: amt, currency: cur, method: p.method, received_by: recv });
              });

              let sumBlock = `💵 Naqd: ${money(cashUzs, cashUsd)}\n💳 Karta: ${money(cardUzs, cardUsd)}`;
              if (othUzs || othUsd) sumBlock += `\n🏦 Boshqa: ${money(othUzs, othUsd)}`;

              const rm = mentionFor(recv);
              blocks.push({
                receiver: recv,
                text:
                  `📊 <b>Kunlik kassa hisoboti</b>\n👤 <b>${recv}</b>${rm ? ` ${rm}` : ""}\n🗓 ${date}\n\n` +
                  lines.join("\n") +
                  `\n\n${sumBlock}` +
                  `\n\n<b>Jami:</b> ${money(tUzs, tUsd)}\n<b>To'lovlar soni:</b> ${list.length}`,

                totalUzs: tUzs,
                totalUsd: tUsd,
                count: list.length,
                details,
              });
            }
          }

          for (const b of blocks) {
            const rMention = b.receiver ? mentionFor(b.receiver) : "";
            const tail = [rMention, mentions].filter(Boolean).join(" ");
            const text =
              b.text +
              (tail ? `\n\n${tail}` : "") +
              (b.receiver
                ? `\n\n${b.receiver}${rMention ? "" : " (rahbar)"}, iltimos tasdiqlang 👇`
                : "\n\nIltimos, tasdiqlang 👇");


            const { data: rep } = await sb
              .from("daily_cash_reports")
              .upsert(
                {
                  tenant_id: g.tenant_id,
                  chat_id: g.chat_id,
                  date,
                  receiver: b.receiver,
                  total_uzs: b.totalUzs,
                  total_usd: b.totalUsd,
                  payments_count: b.count,
                  details: b.details,
                  status: "pending",
                  message_id: null,
                  decided_by_tg: null,
                  decided_by_name: null,
                  decided_at: null,
                },
                { onConflict: "chat_id,date,receiver" },
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
        }

        return Response.json({ ok: true, date, groups: groups.length, sent });
      },
    },
  },
});
