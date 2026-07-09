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
    [{ text: "💵 Oyligim" }, { text: "⚠️ Jarimalarim" }],
  ],
  resize_keyboard: true,
};

const CONTRACTS_ROLES = ["owner", "ceo", "director", "financier"] as const;

function mainKb(role?: string | null) {
  const rows: Array<Array<{ text: string }>> = [
    [{ text: "🟢 Keldim" }],
    [{ text: "💰 Avans so'rash" }, { text: "📅 Javob so'rash" }],
    [{ text: "📋 Bajarilgan ishlar" }],
    [{ text: "💵 Oyligim" }, { text: "⚠️ Jarimalarim" }],
  ];
  if (role && (CONTRACTS_ROLES as readonly string[]).includes(role)) {
    rows.push([{ text: "📄 Shartnomalar" }]);
  }
  return { keyboard: rows, resize_keyboard: true };
}


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

const MONTHS_UZ = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
];

function contractsMonthsKb() {
  const now = nowInTashkent();
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  let row: Array<{ text: string; callback_data: string }> = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    row.push({ text: `${MONTHS_UZ[m - 1]} ${y}`, callback_data: `ctr_${y}_${m}` });
    if (row.length === 2) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  return { inline_keyboard: rows };
}

async function sendContractsForMonth(chatId: number, year: number, month: number) {
  const c = sb();
  const ymStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthStr = String(month);

  const { data: contracts } = await c
    .from("contracts")
    .select("id, client_name, contract_no, contract_date, price_uzs, price_usd, sales_manager, company")
    .eq("year", String(year))
    .eq("month", monthStr)
    .order("contract_date", { ascending: true });

  const list = contracts || [];
  if (list.length === 0) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📄 *${MONTHS_UZ[month - 1]} ${year}*\n\nShu oyda shartnoma yo'q.`,
      parse_mode: "Markdown",
    });
    return;
  }

  const ids = list.map((r: any) => r.id);
  const { data: pays } = await c
    .from("contract_payments")
    .select("contract_id, amount, currency, paid_at")
    .in("contract_id", ids);
  const { data: rates } = await c.from("usd_rates").select("year, month, rate");

  const rateMap = new Map<string, number>();
  (rates || []).forEach((r: any) => rateMap.set(`${r.year}-${String(r.month).padStart(2, "0")}`, Number(r.rate)));
  const allRates = (rates || []).map((r: any) => Number(r.rate)).filter((n: number) => n > 0);
  const fallbackRate = allRates.length ? allRates[allRates.length - 1] : 12700;
  const getRate = (ym: string) => rateMap.get(ym) || fallbackRate;

  const paidByContract = new Map<string, number>();
  (pays || []).forEach((p: any) => {
    const amt = Number(p.amount || 0);
    let usd = 0;
    if ((p.currency || "").toUpperCase() === "USD") usd = amt;
    else {
      const ym = (p.paid_at || "").slice(0, 7);
      const r = getRate(ym);
      usd = r > 0 ? amt / r : 0;
    }
    paidByContract.set(p.contract_id, (paidByContract.get(p.contract_id) || 0) + usd);
  });

  let totalUsd = 0, totalPaid = 0, totalDebt = 0;
  const lines: string[] = [];
  const debtors: string[] = [];

  list.forEach((row: any, i: number) => {
    const priceUsd = Number(row.price_usd || 0);
    const priceUzs = Number(row.price_uzs || 0);
    const total = priceUsd > 0 ? priceUsd : (priceUzs > 0 ? priceUzs / getRate(ymStr) : 0);
    const paid = paidByContract.get(row.id) || 0;
    const debt = Math.max(0, total - paid);
    totalUsd += total; totalPaid += paid; totalDebt += debt;

    const status = total <= 0 ? "—" : (paid + 0.01 >= total ? "✅ To'langan" : (paid > 0 ? `⚠️ Qisman (${fmt(debt)}$ qarz)` : `❌ To'lanmagan (${fmt(debt)}$)`));
    lines.push(`${i + 1}. *${row.client_name || "—"}* ${row.contract_no ? `(№${row.contract_no})` : ""}\n   💵 ${fmt(total)}$ · ${status}${row.sales_manager ? ` · ${row.sales_manager}` : ""}`);
    if (debt > 0.01) debtors.push(`• ${row.client_name || "—"} — ${fmt(debt)}$`);
  });

  const header = `📄 *Shartnomalar — ${MONTHS_UZ[month - 1]} ${year}*\n👥 Jami: ${list.length} ta\n💵 Umumiy: ${fmt(totalUsd)}$\n✅ To'langan: ${fmt(totalPaid)}$\n❌ Qarzdorlik: ${fmt(totalDebt)}$\n`;

  // Chunk to avoid Telegram 4096 char limit
  const chunks: string[] = [];
  let cur = header + "\n";
  for (const l of lines) {
    if (cur.length + l.length + 2 > 3800) { chunks.push(cur); cur = ""; }
    cur += l + "\n\n";
  }
  if (cur.trim()) chunks.push(cur);

  if (debtors.length) {
    let d = `\n💸 *Qarzdorlar (${debtors.length})*\n` + debtors.join("\n");
    if (d.length > 3800) d = d.slice(0, 3800) + "\n…";
    chunks.push(d);
  }

  for (const ch of chunks) {
    await tg("sendMessage", { chat_id: chatId, text: ch, parse_mode: "Markdown" });
  }
}


function monthsKb(prefix: string, count = 12) {
  const now = nowInTashkent();
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  let row: Array<{ text: string; callback_data: string }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    row.push({ text: `${MONTHS_UZ[m - 1]} ${y}`, callback_data: `${prefix}_${y}_${m}` });
    if (row.length === 2) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  return { inline_keyboard: rows };
}

async function sendMySalary(chatId: number, employeeId: string, year: number, month: number) {
  const c = sb();
  const { data: emp } = await c.from("employees").select("full_name").eq("id", employeeId).maybeSingle();
  if (!emp?.full_name) {
    await tg("sendMessage", { chat_id: chatId, text: "❗️ Ishchi ma'lumoti topilmadi." });
    return;
  }
  const { data: sal } = await c
    .from("salaries")
    .select("id, fixed_amount, kpi_amount, penalty_amount, advance_amount, note")
    .eq("employee_name", emp.full_name)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  const title = `💵 *Oyligim — ${MONTHS_UZ[month - 1]} ${year}*\n👤 ${emp.full_name}\n`;
  if (!sal) {
    await tg("sendMessage", { chat_id: chatId, text: title + "\nBu oyga oylik hali kiritilmagan.", parse_mode: "Markdown" });
    return;
  }
  const fixed = Number(sal.fixed_amount || 0);
  const kpi = Number(sal.kpi_amount || 0);
  const penalty = Number(sal.penalty_amount || 0);
  const advance = Number(sal.advance_amount || 0);
  const total = fixed + kpi - penalty;
  const remaining = total - advance;

  // Paid so far
  const { data: pays } = await c
    .from("salary_payments").select("amount").eq("salary_id", sal.id);
  const paid = (pays || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  const text =
    `${title}\n` +
    `➕ Fiks: ${fmt(fixed)} so'm\n` +
    `🎯 KPI: ${fmt(kpi)} so'm\n` +
    `➖ Jarima: ${fmt(penalty)} so'm\n` +
    `💰 Avans: ${fmt(advance)} so'm\n` +
    `─────────\n` +
    `💵 *Jami: ${fmt(total)} so'm*\n` +
    `✅ To'langan: ${fmt(paid)} so'm\n` +
    `🧾 Qoldiq: ${fmt(Math.max(0, total - paid))} so'm` +
    (sal.note ? `\n📝 ${sal.note}` : "");

  await tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown" });
}

async function sendMyFines(chatId: number, employeeId: string, year: number, month: number) {
  const c = sb();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = endDate.toISOString().slice(0, 10);
  const { data: fines } = await c
    .from("fines")
    .select("date, minutes_late, amount_uzs, reason, note")
    .eq("employee_id", employeeId)
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: true });

  const list = fines || [];
  const title = `⚠️ *Jarimalarim — ${MONTHS_UZ[month - 1]} ${year}*\n`;
  if (list.length === 0) {
    await tg("sendMessage", { chat_id: chatId, text: title + "\n🎉 Bu oyda jarima yo'q!", parse_mode: "Markdown" });
    return;
  }
  const reasonLabel = (r: string) => r === "late" ? "Kechikish" : r === "absent" ? "Kelmagan" : r === "no_face_id" ? "FACE ID yo'q" : r === "manual" ? "Qo'lda" : r;
  let total = 0;
  const lines = list.map((f: any, i: number) => {
    const amt = Number(f.amount_uzs || 0);
    total += amt;
    const extra = f.reason === "late" && f.minutes_late ? ` (${f.minutes_late} daq)` : "";
    return `${i + 1}. 📆 ${f.date} — ${reasonLabel(f.reason)}${extra} — *${fmt(amt)} so'm*${f.note ? `\n   📝 ${f.note}` : ""}`;
  });
  const text = `${title}\n${lines.join("\n")}\n\n─────────\n💸 *Jami: ${fmt(total)} so'm*`;
  await tg("sendMessage", { chat_id: chatId, text: text.slice(0, 3900), parse_mode: "Markdown" });
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
              .select("employee_id, bot_state, bot_role")
              .eq("telegram_id", tgId)
              .maybeSingle();
            const MKB = mainKb(tgRow?.bot_role);
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
              const extra = (CONTRACTS_ROLES as readonly string[]).includes(tgRow?.bot_role || "")
                ? "\n📄 Shartnomalar — oylik shartnomalar va qarzdorlar"
                : "";
              await tg("sendMessage", {
                chat_id: chatId,
                text: `Assalomu alaykum${from.first_name ? ", " + from.first_name : ""}! 👋\n\n🟢 Keldim — kelganingizni belgilang\n💰 Avans so'rash — avans uchun ariza\n📅 Javob so'rash — kela olmasangiz javob so'rash\n📋 Bajarilgan ishlar — bugungi ishlar hisoboti${extra}`,
                reply_markup: MKB,
              });
            } else if (text === "📄 Shartnomalar" || text.toLowerCase() === "shartnomalar" || text.startsWith("/shartnomalar")) {
              if (!(CONTRACTS_ROLES as readonly string[]).includes(tgRow?.bot_role || "")) {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "❌ Sizda ruxsat yo'q. Bu bo'lim faqat direktor, owner va financier uchun.",
                  reply_markup: MKB,
                });
              } else {
                await tg("sendMessage", {
                  chat_id: chatId,
                  text: "📄 Qaysi oylikni ko'rmoqchisiz?",
                  reply_markup: contractsMonthsKb(),
                });
              }
            } else if (text === "💵 Oyligim" || text.toLowerCase() === "oyligim" || text.startsWith("/oyligim")) {
              if (!tgRow?.employee_id) {
                await tg("sendMessage", { chat_id: chatId, text: "⚠️ Akkauntingiz hali ishchiga bog'lanmagan.", reply_markup: MKB });
              } else {
                await tg("sendMessage", { chat_id: chatId, text: "💵 Qaysi oy uchun oyligingizni ko'rmoqchisiz?", reply_markup: monthsKb("sal") });
              }
            } else if (text === "⚠️ Jarimalarim" || text.toLowerCase() === "jarimalarim" || text.startsWith("/jarimalarim")) {
              if (!tgRow?.employee_id) {
                await tg("sendMessage", { chat_id: chatId, text: "⚠️ Akkauntingiz hali ishchiga bog'lanmagan.", reply_markup: MKB });
              } else {
                await tg("sendMessage", { chat_id: chatId, text: "⚠️ Qaysi oy jarimalarini ko'rmoqchisiz?", reply_markup: monthsKb("fine") });
              }
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
            } else if (data.startsWith("ctr_")) {
              const { data: actor } = await sb()
                .from("employee_telegram").select("bot_role").eq("telegram_id", tgId).maybeSingle();
              if (!actor || !(CONTRACTS_ROLES as readonly string[]).includes(actor.bot_role || "")) {
                await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "❌ Ruxsat yo'q", show_alert: true });
              } else {
                const parts = data.split("_"); // ctr_YYYY_MM
                const y = Number(parts[1]);
                const m = Number(parts[2]);
                if (y && m) {
                  await sendContractsForMonth(chatId, y, m);
                }
              }
            } else if (data.startsWith("sal_") || data.startsWith("fine_")) {
              const { data: link } = await sb()
                .from("employee_telegram").select("employee_id").eq("telegram_id", tgId).maybeSingle();
              if (!link?.employee_id) {
                await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "❌ Akkauntingiz bog'lanmagan", show_alert: true });
              } else {
                const parts = data.split("_");
                const y = Number(parts[1]);
                const m = Number(parts[2]);
                if (y && m) {
                  if (data.startsWith("sal_")) await sendMySalary(chatId, link.employee_id, y, m);
                  else await sendMyFines(chatId, link.employee_id, y, m);
                }
              }
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
