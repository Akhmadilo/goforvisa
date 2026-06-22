import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "crypto";

function deriveSecret(token: string): string {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}
function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

let _sb: any = null;
function sb(): any {
  if (!_sb) {
    _sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _sb;
}

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN!;
const API = (m: string) => `https://api.telegram.org/bot${TOKEN()}/${m}`;

async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(API(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function fmt(n: number): string {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
}

function todayDate(): string {
  // Asia/Tashkent (UTC+5) — date only
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function nowInTashkent(): Date {
  return new Date(Date.now() + 5 * 3600 * 1000);
}

const MAIN_KB = {
  keyboard: [
    [{ text: "🟢 Keldim" }],
    [{ text: "💰 Avans so'rash" }, { text: "📅 Dam olish" }],
  ],
  resize_keyboard: true,
};

const CANCEL_KB = {
  keyboard: [[{ text: "❌ Bekor qilish" }]],
  resize_keyboard: true,
};

const FACE_INLINE = {
  inline_keyboard: [[
    { text: "✅ Ha, o'tdim", callback_data: "face_yes" },
    { text: "❌ Yo'q", callback_data: "face_no" },
  ]],
};

function leaveDecisionKb(id: string) {
  return {
    inline_keyboard: [
      [{ text: "✅ Tasdiq + oylik hisoblansin", callback_data: `lv_ac_${id}` }],
      [{ text: "✅ Tasdiq + oylik hisoblanmasin", callback_data: `lv_an_${id}` }],
      [{ text: "❌ Rad etish", callback_data: `lv_rj_${id}` }],
    ],
  };
}

function parseLeaveDate(input: string): string | null {
  const s = input.trim().toLowerCase();
  const now = nowInTashkent();
  const fmtD = (d: Date) => d.toISOString().slice(0, 10);
  if (s === "bugun") return fmtD(now);
  if (s === "ertaga") { const d = new Date(now); d.setUTCDate(d.getUTCDate() + 1); return fmtD(d); }
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // DD.MM (current year)
  m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})$/);
  if (m) return `${now.getUTCFullYear()}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

async function notifyDirectorsAboutLeave(leaveId: string, empName: string, date: string, reason: string | null) {
  const c = sb();
  const { data: dirs } = await c
    .from("employee_telegram")
    .select("telegram_id")
    .eq("bot_role", "director");
  const text = `📅 *Yangi dam olish so'rovi*\n\n👤 Ishchi: ${empName}\n📆 Sana: ${date}\n📝 Sabab: ${reason || "—"}`;
  const messages: Array<{ chat_id: number; message_id: number }> = [];
  for (const d of dirs || []) {
    const r: any = await tg("sendMessage", {
      chat_id: d.telegram_id,
      text,
      parse_mode: "Markdown",
      reply_markup: leaveDecisionKb(leaveId),
    });
    if (r?.ok && r.result?.message_id) {
      messages.push({ chat_id: d.telegram_id, message_id: r.result.message_id });
    }
  }
  if (messages.length) {
    await c.from("leave_requests").update({ notif_messages: messages }).eq("id", leaveId);
  }
}

async function handleCheckIn(chatId: number, telegramId: number) {
  const c = sb();
  const { data: link } = await c
    .from("employee_telegram")
    .select("employee_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!link?.employee_id) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Sizning akkauntingiz hali biror ishchiga bog'lanmagan. Admin sizni tizimda ulashini kuting.",
    });
    return;
  }
  const employeeId = link.employee_id as string;
  const date = todayDate();
  const now = nowInTashkent();

  // already checked in?
  const { data: existing } = await c
    .from("attendance")
    .select("id, check_in_at")
    .eq("employee_id", employeeId)
    .eq("date", date)
    .maybeSingle();
  if (existing) {
    const t = new Date(existing.check_in_at as string);
    const hh = String(t.getUTCHours() + 5).padStart(2, "0");
    const mm = String(t.getUTCMinutes()).padStart(2, "0");
    await tg("sendMessage", {
      chat_id: chatId,
      text: `ℹ️ Siz bugun allaqachon belgilangansiz: ${hh}:${mm}`,
    });
    return;
  }

  // insert attendance
  await c.from("attendance").insert({
    employee_id: employeeId,
    date,
    check_in_at: new Date().toISOString(),
    face_id_confirmed: true,
    source: "telegram",
  });

  // compute lateness
  const weekday = now.getUTCDay(); // since we shifted; treat as Tashkent weekday
  const { data: sched } = await c
    .from("employee_schedules")
    .select("start_time, is_working")
    .eq("employee_id", employeeId)
    .eq("weekday", weekday)
    .maybeSingle();

  let lateMin = 0;
  let fineAmt = 0;
  let scheduleNote = "";

  if (sched && sched.is_working === false) {
    scheduleNote = "Bugun dam olish kuningiz, jarima yo'q.";
  } else {
    const startStr = (sched?.start_time as string) || "10:00";
    const [sh, sm] = startStr.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    lateMin = Math.max(0, nowMin - startMin);

    if (lateMin > 0) {
      const { data: rules } = await c
        .from("fine_rules")
        .select("min_minutes, max_minutes, amount_uzs")
        .order("min_minutes", { ascending: true });
      const rule = (rules || []).find((r: any) =>
        lateMin >= r.min_minutes && (r.max_minutes == null || lateMin <= r.max_minutes)
      );
      if (rule) fineAmt = Number(rule.amount_uzs) || 0;
    }
  }

  if (fineAmt > 0) {
    await c.from("fines").upsert({
      employee_id: employeeId,
      date,
      minutes_late: lateMin,
      amount_uzs: fineAmt,
      reason: "late",
    }, { onConflict: "employee_id,date,reason" });
  }

  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  let msg = `✅ Qabul qilindi: ${hh}:${mm}\n`;
  if (scheduleNote) {
    msg += scheduleNote;
  } else if (lateMin === 0) {
    msg += "👍 O'z vaqtida! Jarima yo'q.";
  } else {
    msg += `⏱ Kechikish: ${lateMin} daq\n💸 Jarima: ${fmt(fineAmt)} so'm`;
  }
  await tg("sendMessage", { chat_id: chatId, text: msg, reply_markup: MAIN_KB });
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = TOKEN();
        if (!token) return new Response("Bot not configured", { status: 500 });

        const expected = deriveSecret(token);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update: any = await request.json();

        try {
          // /start or message
          if (update.message) {
            const msg = update.message;
            const chatId = msg.chat.id;
            const from = msg.from || {};
            const tgId = from.id as number;
            const text = (msg.text || "").trim();

            // ensure tg user exists
            await sb().from("employee_telegram").upsert({
              telegram_id: tgId,
              telegram_username: from.username ?? null,
              first_name: from.first_name ?? null,
              last_name: from.last_name ?? null,
            }, { onConflict: "telegram_id" });

            // Load current state + link
            const { data: tgRow } = await sb()
              .from("employee_telegram")
              .select("employee_id, bot_state")
              .eq("telegram_id", tgId)
              .maybeSingle();
            const state: any = tgRow?.bot_state || null;

            const resetState = async () => {
              await sb().from("employee_telegram")
                .update({ bot_state: null }).eq("telegram_id", tgId);
            };
            const setState = async (s: any) => {
              await sb().from("employee_telegram")
                .update({ bot_state: s }).eq("telegram_id", tgId);
            };

            // Universal cancel
            if (text === "❌ Bekor qilish" || text === "/cancel") {
              await resetState();
              await tg("sendMessage", {
                chat_id: chatId,
                text: "Bekor qilindi.",
                reply_markup: MAIN_KB,
              });
            } else if (state?.step === "await_amount") {
              const cleaned = text.replace(/[^\d]/g, "");
              const amount = Number(cleaned);
              if (!amount || amount <= 0) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "❗️ Iltimos summani raqam bilan yozing. Masalan: 500000",
                  reply_markup: CANCEL_KB,
                });
              } else if (amount > 1_000_000_000) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "❗️ Summa juda katta. Iltimos to'g'ri qiymat kiriting.",
                  reply_markup: CANCEL_KB,
                });
              } else {
                await setState({ step: "await_purpose", amount });
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: `Summa: ${fmt(amount)} so'm ✅\n\nEndi avansning maqsadini yozing:`,
                  reply_markup: CANCEL_KB,
                });
              }
            } else if (state?.step === "await_purpose") {
              const purpose = text.slice(0, 500).trim();
              if (purpose.length < 3) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "❗️ Maqsad juda qisqa. Iltimos batafsilroq yozing.",
                  reply_markup: CANCEL_KB,
                });
              } else if (!tgRow?.employee_id) {
                await resetState();
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "⚠️ Akkauntingiz ishchiga bog'lanmagan. Admin sizni tizimda ulashini kuting.",
                  reply_markup: MAIN_KB,
                });
              } else {
                await sb().from("advance_requests").insert({
                  employee_id: tgRow.employee_id,
                  telegram_id: tgId,
                  amount_uzs: state.amount,
                  purpose,
                  status: "pending",
                  source: "telegram",
                });
                await resetState();
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: `✅ Avans so'rovingiz yuborildi!\n\n💰 Summa: ${fmt(state.amount)} so'm\n📝 Maqsad: ${purpose}\n\nDirektor va moliyachi ko'rib chiqishadi. Yakuniy natija haqida xabar yuboramiz.`,
                  reply_markup: MAIN_KB,
                });
              }
            } else if (text.startsWith("/start")) {
              await tg("sendMessage", {
                chat_id: chatId,
                text: `Assalomu alaykum${from.first_name ? ", " + from.first_name : ""}! 👋\n\n🟢 Keldim — kelganingizni belgilang (FACE ID dan keyin)\n💰 Avans so'rash — avans uchun ariza`,
                reply_markup: MAIN_KB,
              });
            } else if (text.startsWith("/chatid") || text.startsWith("/id")) {
              await tg("sendMessage", {
                chat_id: chatId,
                text: `🆔 Chat ID: \`${chatId}\``,
                parse_mode: "Markdown",
                reply_to_message_id: msg.message_id,
              });
            } else if (text === "🟢 Keldim" || text.toLowerCase() === "keldim") {
              await tg("sendMessage", {
                chat_id: chatId,
                text: "FACE ID dan o'tdingizmi?",
                reply_markup: FACE_INLINE,
              });
            } else if (text === "💰 Avans so'rash" || text.toLowerCase() === "avans") {
              if (!tgRow?.employee_id) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "⚠️ Akkauntingiz hali ishchiga bog'lanmagan. Admin sizni tizimda ulashini kuting.",
                  reply_markup: MAIN_KB,
                });
              } else {
                await setState({ step: "await_amount" });
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "💰 Avans summasini so'mda yozing (masalan: 500000):",
                  reply_markup: CANCEL_KB,
                });
              }
            } else {
              await tg("sendMessage", {
                chat_id: chatId,
                text: "Quyidagi tugmalardan birini tanlang.",
                reply_markup: MAIN_KB,
              });
            }
          } else if (update.callback_query) {
            const cq = update.callback_query;
            const chatId = cq.message.chat.id;
            const tgId = cq.from.id as number;
            const data = cq.data as string;

            await tg("answerCallbackQuery", { callback_query_id: cq.id });

            if (data === "face_no") {
              await tg("sendMessage", {
                chat_id: chatId,
                text: "❗️ Iltimos avval FACE ID dan o'ting. So'ng qaytib '🟢 Keldim' ni bosing.",
                reply_markup: MAIN_KB,
              });
            } else if (data === "face_yes") {
              await handleCheckIn(chatId, tgId);
            }
          }
        } catch (e) {
          console.error("telegram webhook error", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
