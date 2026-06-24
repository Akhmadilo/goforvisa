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
    [{ text: "💰 Avans so'rash" }, { text: "📅 Javob so'rash" }],
    [{ text: "📋 Bajarilgan ishlar" }],
  ],
  resize_keyboard: true,
};

const ABSENCE_FINE_UZS = 120000;

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
      [{ text: "⚠️ Tasdiq + oylik hisoblanmasin (120 000 jarima)", callback_data: `lv_an_${id}` }],
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

const APPROVER_ROLES = ["owner", "ceo", "financier", "director"] as const;
const CEO_ROLES = ["owner", "ceo", "director"] as const;

function advanceDecisionKb(id: string) {
  return {
    inline_keyboard: [
      [{ text: "✅ Tasdiqlash", callback_data: `adv_ac_${id}` }],
      [{ text: "❌ Rad etish", callback_data: `adv_rj_${id}` }],
    ],
  };
}

async function notifyDirectorsAboutLeave(leaveId: string, empName: string, date: string, reason: string | null) {
  const c = sb();
  const { data: dirs } = await c
    .from("employee_telegram")
    .select("telegram_id")
    .in("bot_role", CEO_ROLES as unknown as string[]);
  const text = `📅 *Yangi javob so'rash*\n\n👤 Ishchi: ${empName}\n📆 Sana: ${date}\n📝 Sabab: ${reason || "—"}`;
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

async function notifyDirectorsAboutWorkReport(reportId: string, empName: string, date: string, content: string) {
  const c = sb();
  const { data: dirs } = await c
    .from("employee_telegram")
    .select("telegram_id")
    .in("bot_role", CEO_ROLES as unknown as string[]);
  const text = `📋 *Bajarilgan ishlar*\n\n👤 Ishchi: ${empName}\n📆 Sana: ${date}\n\n${content}`;
  const messages: Array<{ chat_id: number; message_id: number }> = [];
  for (const d of dirs || []) {
    const r: any = await tg("sendMessage", {
      chat_id: d.telegram_id,
      text,
      parse_mode: "Markdown",
    });
    if (r?.ok && r.result?.message_id) {
      messages.push({ chat_id: d.telegram_id, message_id: r.result.message_id });
    }
  }
  if (messages.length) {
    await c.from("work_reports").update({ notif_messages: messages }).eq("id", reportId);
  }
}

async function notifyDirectorsAboutAdvance(advId: string, empName: string, amount: number, purpose: string) {
  const c = sb();
  const { data: dirs } = await c
    .from("employee_telegram")
    .select("telegram_id")
    .in("bot_role", CEO_ROLES as unknown as string[]);
  const text = `💰 *Yangi avans so'rovi*\n\n👤 Ishchi: ${empName}\n💵 Summa: ${fmt(amount)} so'm\n📝 Maqsad: ${purpose}`;
  const messages: Array<{ chat_id: number; message_id: number }> = [];
  for (const d of dirs || []) {
    const r: any = await tg("sendMessage", {
      chat_id: d.telegram_id,
      text,
      parse_mode: "Markdown",
      reply_markup: advanceDecisionKb(advId),
    });
    if (r?.ok && r.result?.message_id) {
      messages.push({ chat_id: d.telegram_id, message_id: r.result.message_id });
    }
  }
  if (messages.length) {
    await c.from("advance_requests").update({ notif_messages: messages }).eq("id", advId);
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
                const { data: emp } = await sb()
                  .from("employees").select("full_name").eq("id", tgRow.employee_id).maybeSingle();
                const { data: insAdv } = await sb().from("advance_requests").insert({
                  employee_id: tgRow.employee_id,
                  telegram_id: tgId,
                  amount_uzs: state.amount,
                  purpose,
                  status: "pending",
                  source: "telegram",
                }).select("id").maybeSingle();
                await resetState();
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: `✅ Avans so'rovingiz yuborildi!\n\n💰 Summa: ${fmt(state.amount)} so'm\n📝 Maqsad: ${purpose}\n\nDirektor ko'rib chiqgach, admin yakuniy tasdiqlaydi.`,
                  reply_markup: MAIN_KB,
                });
                if (insAdv?.id) {
                  await notifyDirectorsAboutAdvance(insAdv.id, emp?.full_name || "—", state.amount, purpose);
                }
              }
            } else if (state?.step === "await_leave_date") {
              const d = parseLeaveDate(text);
              if (!d) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "❗️ Sanani to'g'ri kiriting. Masalan: 2026-06-25, 25.06.2026, 25.06, yoki 'bugun' / 'ertaga'.",
                  reply_markup: CANCEL_KB,
                });
              } else {
                await setState({ step: "await_leave_reason", date: d });
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: `Sana: ${d} ✅\n\nEndi sababni yozing (nima uchun kela olmayapsiz):`,
                  reply_markup: CANCEL_KB,
                });
              }
            } else if (state?.step === "await_leave_reason") {
              const reason = text.slice(0, 500).trim();
              if (reason.length < 3) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "❗️ Sabab juda qisqa. Iltimos batafsilroq yozing.",
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
                const { data: emp } = await sb()
                  .from("employees").select("full_name").eq("id", tgRow.employee_id).maybeSingle();
                const { data: ins, error: insErr } = await sb()
                  .from("leave_requests")
                  .upsert({
                    employee_id: tgRow.employee_id,
                    date: state.date,
                    reason,
                    status: "pending",
                    salary_counts: null,
                    fine_amount_uzs: 0,
                    telegram_id: tgId,
                    source: "telegram",
                  }, { onConflict: "employee_id,date" })
                  .select("id").maybeSingle();
                await resetState();
                if (insErr || !ins) {
                  await tg("sendMessage", { chat_id: chatId, text: `❗️ Xatolik: ${insErr?.message || "saqlanmadi"}`, reply_markup: MAIN_KB });
                } else {
                  await tg("sendMessage", {
                    chat_id: chatId,
                    text: `✅ Javob so'rashingiz yuborildi!\n\n📆 Sana: ${state.date}\n📝 Sabab: ${reason}\n\nDirektor ko'rib chiqgach xabar yuboramiz.`,
                    reply_markup: MAIN_KB,
                  });
                  await notifyDirectorsAboutLeave(ins.id, emp?.full_name || "—", state.date, reason);
                }
              }
            } else if (state?.step === "await_work_report") {
              const content = text.slice(0, 4000).trim();
              if (content.length < 3) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "❗️ Matn juda qisqa. Bajarilgan ishlaringizni batafsilroq yozing.",
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
                const { data: emp } = await sb()
                  .from("employees").select("full_name").eq("id", tgRow.employee_id).maybeSingle();
                const date = todayDate();
                const { data: dup } = await sb()
                  .from("work_reports").select("id")
                  .eq("employee_id", tgRow.employee_id).eq("date", date).maybeSingle();
                if (dup) {
                  await resetState();
                  await tg("sendMessage", {
                    chat_id: chatId,
                    text: "ℹ️ Bugungi hisobotingiz allaqachon qabul qilingan. Bir kunda faqat bir marta to'ldirish mumkin.",
                    reply_markup: MAIN_KB,
                  });
                } else {
                  const { data: ins, error: insErr } = await sb()
                    .from("work_reports")
                    .insert({
                      employee_id: tgRow.employee_id,
                      telegram_id: tgId,
                      date,
                      content,
                    })
                    .select("id").maybeSingle();
                  await resetState();
                  if (insErr || !ins) {
                    await tg("sendMessage", { chat_id: chatId, text: `❗️ Xatolik: ${insErr?.message || "saqlanmadi"}`, reply_markup: MAIN_KB });
                  } else {
                    await tg("sendMessage", {
                      chat_id: chatId,
                      text: `✅ Bajarilgan ishlar qabul qilindi!\n\n📆 Sana: ${date}\n\nDirektor va Ownerga yuborildi.`,
                      reply_markup: MAIN_KB,
                    });
                    await notifyDirectorsAboutWorkReport(ins.id, emp?.full_name || "—", date, content);
                  }
                }
              }
            } else if (text.startsWith("/start")) {
              await tg("sendMessage", {
                chat_id: chatId,
                text: `Assalomu alaykum${from.first_name ? ", " + from.first_name : ""}! 👋\n\n🟢 Keldim — kelganingizni belgilang\n💰 Avans so'rash — avans uchun ariza\n📅 Javob so'rash — kela olmasangiz javob so'rash\n📋 Bajarilgan ishlar — bugungi ishlar hisoboti`,
                reply_markup: MAIN_KB,
              });
            } else if (text.startsWith("/dam_olish") || text.startsWith("/javob") || text === "📅 Javob so'rash" || text === "📅 Dam olish" || text.toLowerCase() === "javob so'rash" || text.toLowerCase() === "dam olish") {
              if (!tgRow?.employee_id) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "⚠️ Akkauntingiz hali ishchiga bog'lanmagan. Admin sizni tizimda ulashini kuting.",
                  reply_markup: MAIN_KB,
                });
              } else {
                await setState({ step: "await_leave_date" });
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "📅 Qaysi kunga javob so'ramoqchisiz?\n\nSanani kiriting (masalan: 2026-06-25, 25.06.2026, 25.06, bugun, ertaga):",
                  reply_markup: CANCEL_KB,
                });
              }
            } else if (text === "📋 Bajarilgan ishlar" || text.toLowerCase() === "bajarilgan ishlar" || text.startsWith("/bajarilgan")) {
              if (!tgRow?.employee_id) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "⚠️ Akkauntingiz hali ishchiga bog'lanmagan. Admin sizni tizimda ulashini kuting.",
                  reply_markup: MAIN_KB,
                });
              } else {
                const { data: already } = await sb()
                  .from("work_reports").select("id, content")
                  .eq("employee_id", tgRow.employee_id).eq("date", todayDate()).maybeSingle();
                if (already) {
                  await tg("sendMessage", {
                    chat_id: chatId,
                    text: `ℹ️ Bugungi hisobotingiz allaqachon qabul qilingan. Bir kunda faqat bir marta to'ldirish mumkin.\n\n📝 Yuborilgan:\n${(already.content as string).slice(0, 1500)}`,
                    reply_markup: MAIN_KB,
                  });
                } else {
                  await setState({ step: "await_work_report" });
                  await tg("sendMessage", {
                    chat_id: chatId,
                    text: "📋 Bugun bajargan ishlaringizni batafsil yozing:",
                    reply_markup: CANCEL_KB,
                  });
                }
              }
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
            } else if (data.startsWith("lv_")) {
              // Director CEO-stage leave decisions: lv_ac_<id>, lv_an_<id>, lv_rj_<id>
              const c = sb();
              const { data: actor } = await c
                .from("employee_telegram").select("bot_role").eq("telegram_id", tgId).maybeSingle();
              if (!actor || !CEO_ROLES.includes(actor.bot_role as any)) {
                await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "❌ Sizda ruxsat yo'q (faqat Owner/CEO).", show_alert: true });
              } else {
                const action = data.slice(3, 5);
                const leaveId = data.slice(6);
                const { data: lv } = await c
                  .from("leave_requests")
                  .select("id, employee_id, date, reason, status, ceo_status, telegram_id, notif_messages, employees(full_name)")
                  .eq("id", leaveId).maybeSingle();
                if (!lv) {
                  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov topilmadi", show_alert: true });
                } else if ((lv as any).ceo_status !== "pending") {
                  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: `Allaqachon ${(lv as any).ceo_status}`, show_alert: true });
                } else {
                  let proposed: boolean | null = null;
                  let resultText = "";
                  let ceoStatus: "approved" | "rejected" = "approved";
                  if (action === "ac") { proposed = true; resultText = "✅ Direktor tasdig'i: oylik hisoblansin"; }
                  else if (action === "an") { proposed = false; resultText = `✅ Direktor tasdig'i: oylik hisoblanmasin (kelmagan kun uchun ${fmt(ABSENCE_FINE_UZS)} so'm jarima)`; }
                  else if (action === "rj") { ceoStatus = "rejected"; resultText = "❌ Direktor rad etdi"; }

                  const patch: Record<string, unknown> = {
                    ceo_status: ceoStatus,
                    ceo_decided_at: new Date().toISOString(),
                    ceo_decided_by_tg: tgId,
                    proposed_salary_counts: proposed,
                  };
                  // If CEO chose "oylik hisoblanmasin" — auto-finalize and apply absence fine
                  if (ceoStatus === "approved" && proposed === false) {
                    patch.status = "approved";
                    patch.salary_counts = false;
                    patch.fine_amount_uzs = ABSENCE_FINE_UZS;
                    patch.decided_at = new Date().toISOString();
                    // Apply 120000 absence fine to fines table for that day
                    await c.from("fines").upsert({
                      employee_id: (lv as any).employee_id,
                      date: (lv as any).date,
                      minutes_late: 0,
                      amount_uzs: ABSENCE_FINE_UZS,
                      reason: "absent",
                      note: "Javob so'rash: oylik hisoblanmasin",
                    }, { onConflict: "employee_id,date,reason" });
                    // Remove any 'late' fine for that day (employee didn't work)
                    await c.from("fines").delete()
                      .eq("employee_id", (lv as any).employee_id)
                      .eq("date", (lv as any).date)
                      .eq("reason", "late");
                    // Remove attendance for that day if any
                    await c.from("attendance").delete()
                      .eq("employee_id", (lv as any).employee_id)
                      .eq("date", (lv as any).date);
                  }
                  // If CEO rejected, finalize whole request as rejected.
                  if (ceoStatus === "rejected") {
                    patch.status = "rejected";
                    patch.decided_at = new Date().toISOString();
                  }
                  await c.from("leave_requests").update(patch).eq("id", leaveId);

                  const empName = (lv as any).employees?.full_name || "—";
                  const msgs: Array<{ chat_id: number; message_id: number }> = (lv.notif_messages as any) || [];
                  const tailNote = ceoStatus === "approved"
                    ? (proposed === false ? "\n\n✅ Yakuniylashdi (avtomat jarima qo'llandi)" : "\n\n⏳ Admin yakuniy tasdig'i kutilmoqda")
                    : "";
                  const finalText = `📅 *Javob so'rash*\n\n👤 Ishchi: ${empName}\n📆 Sana: ${lv.date}\n📝 Sabab: ${lv.reason || "—"}\n\n${resultText}${tailNote}`;
                  for (const m of msgs) {
                    await tg("editMessageText", {
                      chat_id: m.chat_id, message_id: m.message_id,
                      text: finalText, parse_mode: "Markdown",
                    });
                  }
                  if (lv.telegram_id) {
                    let userMsg = "";
                    if (ceoStatus === "approved") {
                      if (proposed === false) {
                        userMsg = `📩 Javob so'rashingiz (${lv.date}) direktor tomonidan tasdiqlandi.\n⚠️ Oylik hisoblanmaydi\n💸 Kelmagan kun uchun jarima: ${fmt(ABSENCE_FINE_UZS)} so'm`;
                      } else {
                        userMsg = `📩 Javob so'rashingiz (${lv.date}) direktor tomonidan tasdiqlandi.\n💰 Oylik hisoblanadi (taklif).\n\n⏳ Admin yakuniy javobni beradi.`;
                      }
                    } else {
                      userMsg = `❌ Javob so'rashingiz rad etildi (${lv.date}).`;
                    }
                    await tg("sendMessage", { chat_id: lv.telegram_id, text: userMsg });
                  }
                  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: resultText });
                }
              }
            } else if (data.startsWith("adv_")) {
              // Director CEO-stage advance decisions: adv_ac_<id>, adv_rj_<id>
              const c = sb();
              const { data: actor } = await c
                .from("employee_telegram").select("bot_role").eq("telegram_id", tgId).maybeSingle();
              if (!actor || !CEO_ROLES.includes(actor.bot_role as any)) {
                await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "❌ Sizda ruxsat yo'q (faqat Owner/CEO).", show_alert: true });
              } else {
                const action = data.slice(4, 6);
                const advId = data.slice(7);
                const { data: adv } = await c
                  .from("advance_requests")
                  .select("id, employee_id, amount_uzs, purpose, status, telegram_id, notif_messages, employees(full_name)")
                  .eq("id", advId).maybeSingle();
                if (!adv) {
                  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov topilmadi", show_alert: true });
                } else if ((adv as any).status !== "pending") {
                  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: `Allaqachon ${(adv as any).status}`, show_alert: true });
                } else {
                  let resultText = "";
                  const patch: Record<string, unknown> = {};
                  if (action === "ac") {
                    patch.status = "ceo_approved";
                    patch.ceo_approved_at = new Date().toISOString();
                    resultText = "✅ Direktor tasdiqladi — admin yakuniylashtiradi";
                  } else if (action === "rj") {
                    patch.status = "rejected";
                    patch.rejected_at = new Date().toISOString();
                    patch.rejected_reason = "Direktor rad etdi";
                    resultText = "❌ Direktor rad etdi";
                  }
                  await c.from("advance_requests").update(patch).eq("id", advId);

                  const empName = (adv as any).employees?.full_name || "—";
                  const msgs: Array<{ chat_id: number; message_id: number }> = ((adv as any).notif_messages as any) || [];
                  const finalText = `💰 *Avans so'rovi*\n\n👤 Ishchi: ${empName}\n💵 Summa: ${fmt(Number((adv as any).amount_uzs))} so'm\n📝 Maqsad: ${(adv as any).purpose}\n\n${resultText}`;
                  for (const m of msgs) {
                    await tg("editMessageText", {
                      chat_id: m.chat_id, message_id: m.message_id,
                      text: finalText, parse_mode: "Markdown",
                    });
                  }
                  if ((adv as any).telegram_id) {
                    const userMsg = action === "ac"
                      ? `📩 Avans so'rovingiz direktor tomonidan tasdiqlandi.\n💵 Summa: ${fmt(Number((adv as any).amount_uzs))} so'm\n\n⏳ Admin yakuniy javobni beradi.`
                      : `❌ Avans so'rovingiz rad etildi.\n💵 Summa: ${fmt(Number((adv as any).amount_uzs))} so'm`;
                    await tg("sendMessage", { chat_id: (adv as any).telegram_id, text: userMsg });
                  }
                  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: resultText });
                }
              }
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
