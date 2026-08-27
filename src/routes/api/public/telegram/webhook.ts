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
    [{ text: "🎁 Bonusim" }],
  ],
  resize_keyboard: true,
};

const CONTRACTS_ROLES = ["owner", "ceo", "director", "financier"] as const;

export type BotFeatures = Record<string, boolean>;

/** Feature is enabled unless explicitly disabled in bot_settings.employee_features */
function feat(f: BotFeatures | null | undefined, key: string) {
  return !f || f[key] !== false;
}

/** Which employee feature a given menu text belongs to (null = always allowed) */
function featureOfText(text: string): string | null {
  const t = text.toLowerCase();
  if (text === "🟢 Keldim" || t === "keldim") return "attendance";
  if (text === "💰 Avans so'rash" || t === "avans") return "advance";
  if (text === "📅 Javob so'rash" || text === "📅 Dam olish" || t === "javob so'rash" || t === "dam olish" || t.startsWith("/javob") || t.startsWith("/dam_olish")) return "leave";
  if (text === "📋 Bajarilgan ishlar" || t === "bajarilgan ishlar" || t.startsWith("/bajarilgan")) return "work_report";
  if (text === "💵 Oyligim" || t === "oyligim" || t.startsWith("/oyligim")) return "salary";
  if (text === "⚠️ Jarimalarim" || t === "jarimalarim" || t.startsWith("/jarimalarim")) return "fines";
  if (text === "🎁 Bonusim" || t === "bonusim" || t.startsWith("/bonusim")) return "bonus";
  if (text === "📄 Shartnomalar" || t === "shartnomalar" || t.startsWith("/shartnomalar")) return "contracts";
  return null;
}

function mainKb(role?: string | null, features?: BotFeatures | null) {
  const rows: Array<Array<{ text: string }>> = [];
  if (feat(features, "attendance")) rows.push([{ text: "🟢 Keldim" }]);
  const r2: Array<{ text: string }> = [];
  if (feat(features, "advance")) r2.push({ text: "💰 Avans so'rash" });
  if (feat(features, "leave")) r2.push({ text: "📅 Javob so'rash" });
  if (r2.length) rows.push(r2);
  if (feat(features, "work_report")) rows.push([{ text: "📋 Bajarilgan ishlar" }]);
  const r4: Array<{ text: string }> = [];
  if (feat(features, "salary")) r4.push({ text: "💵 Oyligim" });
  if (feat(features, "fines")) r4.push({ text: "⚠️ Jarimalarim" });
  if (r4.length) rows.push(r4);
  if (feat(features, "bonus")) rows.push([{ text: "🎁 Bonusim" }]);
  if (role && (CONTRACTS_ROLES as readonly string[]).includes(role) && feat(features, "contracts")) {
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

async function sendMyBonus(chatId: number, employeeId: string, year: number, month: number) {

  const c = sb();
  const { data: emp } = await c.from("employees").select("full_name").eq("id", employeeId).maybeSingle();
  const name = emp?.full_name;
  if (!name) {
    await tg("sendMessage", { chat_id: chatId, text: "❗️ Ishchi ma'lumoti topilmadi." });
    return;
  }

  // USD rates for payment conversion
  const { data: rates } = await c.from("usd_rates").select("year, month, rate");
  const rateMap = new Map<string, number>();
  (rates || []).forEach((r: any) => rateMap.set(`${r.year}-${String(r.month).padStart(2, "0")}`, Number(r.rate)));
  const allRates = (rates || []).map((r: any) => Number(r.rate)).filter((n: number) => n > 0);
  const fallbackRate = allRates.length ? allRates[allRates.length - 1] : 12700;
  const getRate = (ym: string) => rateMap.get(ym) || fallbackRate;

  // KPI rates and approvals
  const { data: kpiRates } = await c
    .from("sales_kpi_rates")
    .select("manager_name, rate_per_usd, role")
    .eq("manager_name", name);
  const rateFor = (role: string, def: number) => {
    const r = (kpiRates || []).find((x: any) => x.role === role);
    return r ? Number(r.rate_per_usd) : def;
  };

  const { data: approvals } = await c
    .from("sales_kpi_approvals")
    .select("contract_id, role, status, bonus_uzs, approved_year, approved_month")
    .eq("manager_name", name);
  const decidedByRole = new Map<string, Map<string, any>>();
  (approvals || []).forEach((a: any) => {
    if (!decidedByRole.has(a.role)) decidedByRole.set(a.role, new Map());
    decidedByRole.get(a.role)!.set(a.contract_id, a);
  });

  const targetYm = `${year}-${String(month).padStart(2, "0")}`;

  // Sales KPI: all contracts where sales_manager = name (month determined by full-payment date)
  const { data: salesC } = await c
    .from("contracts")
    .select("id, client_name, price_usd, commission, visa_result")
    .eq("sales_manager", name)
    .gt("price_usd", 0)
    .gt("commission", 0);

  // Back-office KPI: all contracts where back_office_manager = name
  const { data: boC } = await c
    .from("contracts")
    .select("id, client_name, price_usd, commission, visa_result")
    .eq("back_office_manager", name)
    .gt("price_usd", 0)
    .gt("commission", 0);

  // Visa bonus: contracts where visa was taken during selected month
  const visaStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const visaEndDate = new Date(Date.UTC(year, month, 1));
  const visaEnd = visaEndDate.toISOString().slice(0, 10);
  const { data: visaC } = await c
    .from("contracts")
    .select("id, client_name, price_usd, commission, visa_result, visa_taken_date")
    .eq("back_office_manager", name)
    .eq("visa_result", "Olindi")
    .gte("visa_taken_date", visaStart)
    .lt("visa_taken_date", visaEnd)
    .gt("commission", 0);

  const allContractIds = [
    ...((salesC || []).map((r: any) => r.id)),
    ...((boC || []).map((r: any) => r.id)),
    ...((visaC || []).map((r: any) => r.id)),
  ];
  const uniqueIds = Array.from(new Set(allContractIds));
  const { data: pays } = uniqueIds.length
    ? await c.from("contract_payments").select("contract_id, amount, currency, paid_at").in("contract_id", uniqueIds).order("paid_at", { ascending: true })
    : { data: [] as any[] };

  const paysByContract = new Map<string, any[]>();
  (pays || []).forEach((p: any) => {
    const arr = paysByContract.get(p.contract_id) || [];
    arr.push(p);
    paysByContract.set(p.contract_id, arr);
  });

  // Returns "YYYY-MM" of the payment that fully closed the contract, or null.
  const fullyPaidMonth = (contractId: string, priceUsd: number): string | null => {
    const ps = paysByContract.get(contractId) || [];
    let running = 0;
    for (const p of ps) {
      const amt = Number(p.amount || 0);
      const ym = (p.paid_at || "").slice(0, 7);
      const usd = (p.currency || "UZS") === "USD" ? amt : amt / getRate(ym);
      running += usd;
      if (running >= priceUsd - 0.01) return ym;
    }
    return null;
  };

  type BonusRow = { client: string; bonus: number };
  const buildGroup = (role: string, defRate: number, source: any[], filter: (c: any) => boolean) => {
    const rate = rateFor(role, defRate);
    const decided = decidedByRole.get(role) || new Map();
    const pending: BonusRow[] = [];
    let approvedInMonth = 0;
    for (const row of source) {
      if (row.visa_result === "Bekor qilindi" || row.visa_result === "To'xtatildi") continue;
      if (!filter(row)) continue;
      const commissionUsd = Number(row.commission || 0);
      if (commissionUsd <= 0) continue;
      const bonus = Math.round(commissionUsd * rate);
      const dec = decided.get(row.id);
      if (!dec) {
        pending.push({ client: row.client_name || "—", bonus });
      } else if (dec.status === "approved") {
        approvedInMonth += Number(dec.bonus_uzs || bonus);
      }
    }
    const total = pending.reduce((s, r) => s + r.bonus, 0);
    return { pending, total, approvedInMonth };
  };

  const salesGroup = buildGroup("sales", 500, salesC || [], (row: any) => fullyPaidMonth(row.id, Number(row.price_usd || 0)) === targetYm);
  const boGroup = buildGroup("back_office", 500, boC || [], (row: any) => fullyPaidMonth(row.id, Number(row.price_usd || 0)) === targetYm);
  const visaGroup = buildGroup("visa_bonus", 250, visaC || [], () => true);

  const sections: string[] = [];
  const renderList = (rows: BonusRow[]) =>
    rows.slice(0, 30).map((r, i) => `${i + 1}. ${r.client} — ${fmt(r.bonus)} so'm`).join("\n") +
    (rows.length > 30 ? `\n… va yana ${rows.length - 30} ta` : "");

  if (salesGroup.pending.length || salesGroup.approvedInMonth) {
    sections.push(
      `🛒 *Sales KPI*\n⏳ Kutilmoqda: *${fmt(salesGroup.total)} so'm* (${salesGroup.pending.length} ta)` +
      (salesGroup.approvedInMonth ? `\n✅ Tasdiqlangan: ${fmt(salesGroup.approvedInMonth)} so'm` : "") +
      (salesGroup.pending.length ? `\n\n${renderList(salesGroup.pending)}` : ""),
    );
  }
  if (boGroup.pending.length || boGroup.approvedInMonth) {
    sections.push(
      `🏢 *Back Office KPI*\n⏳ Kutilmoqda: *${fmt(boGroup.total)} so'm* (${boGroup.pending.length} ta)` +
      (boGroup.approvedInMonth ? `\n✅ Tasdiqlangan: ${fmt(boGroup.approvedInMonth)} so'm` : "") +
      (boGroup.pending.length ? `\n\n${renderList(boGroup.pending)}` : ""),
    );
  }
  if (visaGroup.pending.length || visaGroup.approvedInMonth) {
    sections.push(
      `🛂 *Viza bonusi*\n⏳ Kutilmoqda: *${fmt(visaGroup.total)} so'm* (${visaGroup.pending.length} ta)` +
      (visaGroup.approvedInMonth ? `\n✅ Tasdiqlangan: ${fmt(visaGroup.approvedInMonth)} so'm` : "") +
      (visaGroup.pending.length ? `\n\n${renderList(visaGroup.pending)}` : ""),
    );
  }

  const totalPending = salesGroup.total + boGroup.total + visaGroup.total;
  const header = `🎁 *Bonuslarim — ${MONTHS_UZ[month - 1]} ${year}*\n👤 ${name}\n💰 Jami kutilayotgan: *${fmt(totalPending)} so'm*`;

  const body = sections.length ? sections.join("\n\n───────────\n") : "Bu oy uchun bonus yo'q.";
  const text = `${header}\n\n${body}`;
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

// ===== Group (kunlik kassa hisoboti) =====
async function isCashAdmin(tgId: number): Promise<boolean> {
  const { data } = await sb()
    .from("employee_telegram").select("bot_role").eq("telegram_id", tgId).maybeSingle();
  return !!data && (CONTRACTS_ROLES as readonly string[]).includes(data.bot_role || "");
}

const CASH_METHOD_LABEL: Record<string, string> = {
  cash: "💵 Naqd", naqd: "💵 Naqd", card: "💳 Karta", plastik: "💳 Karta",
  bank: "🏦 Bank", transfer: "🏦 O'tkazma",
};
function cashMethodLabel(m: string | null): string {
  if (!m) return "💵 Naqd";
  return CASH_METHOD_LABEL[m.toLowerCase().trim()] || m;
}

function shiftDate(base: string, days: number): string {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nowHm(): string {
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  return d.toISOString().slice(11, 16);
}

async function buildCashText(tenantId: string, date: string, live = false): Promise<string> {
  const { data: pays } = await sb()
    .from("contract_payments")
    .select("amount, currency, method, contract_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("paid_at", date)
    .order("created_at", { ascending: true });

  const rows = (pays || []) as any[];
  const ids = Array.from(new Set(rows.map((p) => p.contract_id)));
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: ctrs } = await sb()
      .from("contracts").select("id, client_name, contract_no").in("id", ids);
    for (const c of (ctrs || []) as any[]) {
      names[c.id] = c.client_name + (c.contract_no ? ` (№${c.contract_no})` : "");
    }
  }

  let totalUzs = 0, totalUsd = 0;
  const lines: string[] = [];
  rows.forEach((p, i) => {
    const cur = (p.currency || "UZS").toUpperCase();
    const amt = Number(p.amount) || 0;
    if (cur === "USD") totalUsd += amt; else totalUzs += amt;
    const client = names[p.contract_id] || "Noma'lum mijoz";
    const sum = cur === "USD" ? `$${fmt(amt)}` : `${fmt(amt)} so'm`;
    lines.push(`${i + 1}. ${client}\n    ${sum} — ${cashMethodLabel(p.method)}`);
  });

  const header = live
    ? `🟢 <b>Kassa — hozirgi holat</b>\n🗓 ${date} · ⏱ ${nowHm()} gacha\n\n`
    : `📊 <b>Kunlik kassa hisoboti</b>\n🗓 ${date}\n\n`;
  if (rows.length === 0)
    return header + (live ? "Hozircha to'lov qabul qilinmagan." : "Bu kuni to'lov qabul qilinmagan.");
  return (
    header + lines.join("\n") +
    `\n\n<b>Jami:</b> ${totalUzs > 0 ? fmt(totalUzs) + " so'm" : ""}` +
    `${totalUzs > 0 && totalUsd > 0 ? " + " : ""}` +
    `${totalUsd > 0 ? "$" + fmt(totalUsd) : ""}` +
    `${totalUzs === 0 && totalUsd === 0 ? "0" : ""}` +
    `\n<b>To'lovlar soni:</b> ${rows.length}`
  );
}

async function cashTenantFor(chatId: number, tgId: number): Promise<string | null> {
  const { data: g } = await sb()
    .from("telegram_groups").select("tenant_id").eq("chat_id", chatId).maybeSingle();
  if (g?.tenant_id) return g.tenant_id;
  const { data: e } = await sb()
    .from("employee_telegram").select("tenant_id").eq("telegram_id", tgId).maybeSingle();
  return e?.tenant_id ?? null;
}

function cashDaysKeyboard() {
  const today = todayDate();
  const rows: any[][] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDate(today, -i);
    const label = i === 0 ? `Bugun (${d.slice(5)})` : i === 1 ? `Kecha (${d.slice(5)})` : d;
    if (i % 2 === 0) rows.push([]);
    rows[rows.length - 1].push({ text: label, callback_data: `cash_day_${d}` });
  }
  rows.push([{ text: "🟢 Hozirgi holat", callback_data: "cash_now" }]);
  return { inline_keyboard: rows };
}

const CASH_NOW_KB = {
  inline_keyboard: [[{ text: "🔄 Yangilash", callback_data: "cash_now" }]],
};

export async function handleCashDay(cq: any, date: string) {
  const chatId = cq.message.chat.id;
  const tgId = cq.from.id as number;
  if (!(await isCashAdmin(tgId))) {
    await tg("answerCallbackQuery", {
      callback_query_id: cq.id, text: "❌ Faqat rahbariyat ko'ra oladi.", show_alert: true,
    });
    return;
  }
  const tenantId = await cashTenantFor(chatId, tgId);
  if (!tenantId) {
    await tg("sendMessage", { chat_id: chatId, text: "❌ Kompaniya aniqlanmadi. /kassa_on ni bosing." });
    return;
  }
  const text = await buildCashText(tenantId, date);
  await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

export async function handleCashNow(cq: any) {
  const chatId = cq.message.chat.id;
  const tgId = cq.from.id as number;
  if (!(await isCashAdmin(tgId))) {
    await tg("answerCallbackQuery", {
      callback_query_id: cq.id, text: "❌ Faqat rahbariyat ko'ra oladi.", show_alert: true,
    });
    return;
  }
  const tenantId = await cashTenantFor(chatId, tgId);
  if (!tenantId) {
    await tg("sendMessage", { chat_id: chatId, text: "❌ Kompaniya aniqlanmadi. /kassa_on ni bosing." });
    return;
  }
  const text = await buildCashText(tenantId, todayDate(), true);
  await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", reply_markup: CASH_NOW_KB });
}

const ALL_COMMANDS_TEXT =
  "<b>🤖 GoForVisa bot — barcha buyruqlar</b>\n\n" +
  "<b>💰 Kassa (guruh uchun)</b>\n" +
  "/kassa_on — har kuni 21:00 da kunlik hisobot shu guruhga kelsin\n" +
  "/kassa_off — kunlik hisobotni o'chirish\n" +
  "/kassa_status — ulanish holatini ko'rish\n" +
  "/kassa — oldingi 7 kundan birini tanlab hisobotni ko'rish\n" +
  "/kassa_hozir — hozirgi daqiqagacha tushgan pul (online holat)\n" +
  "/kassa 2026-08-21 — aniq sana bo'yicha hisobot\n\n" +
  "<b>👤 Shaxsiy chatda (bot bilan yozishmada)</b>\n" +
  "/start — ro'yxatdan o'tish va asosiy menyu\n" +
  "💵 Oyligim — o'z oyligingizni ko'rish\n" +
  "⚠️ Jarimalarim — oy bo'yicha jarimalaringiz\n" +
  "🎁 Bonusim — oxirgi 3 oydan birini tanlab kutilayotgan bonus\n" +
  "📄 Shartnomalar — (faqat direktor/owner/moliyachi) oy bo'yicha shartnomalar\n\n" +
  "<b>ℹ️ Yordam</b>\n" +
  "/buyruqlar yoki /help — shu ro'yxatni qayta chiqarish";

async function sendAndPinCommands(chatId: number) {
  const r: any = await tg("sendMessage", {
    chat_id: chatId,
    text: ALL_COMMANDS_TEXT,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  const mid = r?.result?.message_id;
  if (mid) {
    await tg("pinChatMessage", {
      chat_id: chatId,
      message_id: mid,
      disable_notification: true,
    });
  }
}

async function handleGroupMessage(chatId: number, tgId: number, text: string, title?: string) {
  const raw = text.split("@")[0].trim();
  const cmd = raw.toLowerCase();
  const kassaDate = /^\/kassa\s+(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (
    !["/kassa_on", "/kassa_off", "/kassa_status", "/kassa", "/kassa_hozir", "/start", "/help", "/buyruqlar"].includes(cmd) &&
    !kassaDate
  )
    return;

  if (cmd === "/start" || cmd === "/help" || cmd === "/buyruqlar") {
    await sendAndPinCommands(chatId);
    return;
  }


  if (!(await isCashAdmin(tgId))) {
    await tg("sendMessage", { chat_id: chatId, text: "❌ Bu buyruq faqat rahbariyat uchun." });
    return;
  }

  if (kassaDate) {
    const tenantId = await cashTenantFor(chatId, tgId);
    if (!tenantId) {
      await tg("sendMessage", { chat_id: chatId, text: "❌ Kompaniya aniqlanmadi. /kassa_on ni bosing." });
      return;
    }
    const t = await buildCashText(tenantId, kassaDate[1]);
    await tg("sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
    return;
  }

  if (cmd === "/kassa_hozir") {
    const tenantId = await cashTenantFor(chatId, tgId);
    if (!tenantId) {
      await tg("sendMessage", { chat_id: chatId, text: "❌ Kompaniya aniqlanmadi. /kassa_on ni bosing." });
      return;
    }
    const t = await buildCashText(tenantId, todayDate(), true);
    await tg("sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML", reply_markup: CASH_NOW_KB });
    return;
  }

  if (cmd === "/kassa") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "🗓 Qaysi kun hisoboti kerak?",
      reply_markup: cashDaysKeyboard(),
    });
    return;
  }



  if (cmd === "/kassa_on") {
    await sb().from("telegram_groups").upsert(
      { chat_id: chatId, title: title || null, kind: "daily_cash", is_active: true },
      { onConflict: "chat_id" },
    );
    await tg("sendMessage", {
      chat_id: chatId,
      text: "✅ Guruh ulandi. Har kuni soat 21:00 da kunlik tushgan pullar hisoboti shu yerga keladi.",
    });
    await sendAndPinCommands(chatId);

  } else if (cmd === "/kassa_off") {
    await sb().from("telegram_groups").update({ is_active: false }).eq("chat_id", chatId);
    await tg("sendMessage", { chat_id: chatId, text: "🛑 Kunlik hisobot o'chirildi." });
  } else {
    const { data } = await sb()
      .from("telegram_groups").select("is_active").eq("chat_id", chatId).maybeSingle();
    await tg("sendMessage", {
      chat_id: chatId,
      text: data?.is_active ? "✅ Yoqilgan (21:00)" : "🛑 O'chirilgan. /kassa_on ni bosing.",
    });
  }
}

async function handleCashDecision(cq: any, ok: boolean, reportId: string) {
  const chatId = cq.message.chat.id;
  const tgId = cq.from.id as number;
  if (!(await isCashAdmin(tgId))) {
    await tg("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: "❌ Faqat rahbariyat tasdiqlay oladi.",
      show_alert: true,
    });
    return;
  }
  const { data: rep } = await sb()
    .from("daily_cash_reports").select("id, status").eq("id", reportId).maybeSingle();
  if (!rep) {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Hisobot topilmadi", show_alert: true });
    return;
  }
  if (rep.status !== "pending") {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Allaqachon belgilangan", show_alert: true });
    return;
  }
  const name = [cq.from.first_name, cq.from.last_name].filter(Boolean).join(" ") ||
    (cq.from.username ? "@" + cq.from.username : String(tgId));
  await sb().from("daily_cash_reports").update({
    status: ok ? "confirmed" : "rejected",
    decided_by_tg: tgId,
    decided_by_name: name,
    decided_at: new Date().toISOString(),
  }).eq("id", reportId);

  const stamp = nowInTashkent().toISOString().slice(11, 16);
  const suffix = ok
    ? `\n\n✅ <b>Qabul qilindi</b> — ${name} (${stamp})`
    : `\n\n❌ <b>Noto'g'ri deb belgilandi</b> — ${name} (${stamp})\nIltimos, moliya bo'limi tekshirsin.`;
  const base = (cq.message.text || "").replace(/\n\nIltimos, tasdiqlang 👇$/, "");
  await tg("editMessageText", {
    chat_id: chatId,
    message_id: cq.message.message_id,
    text: base + suffix,
    parse_mode: "HTML",
  });
  await tg("answerCallbackQuery", {
    callback_query_id: cq.id,
    text: ok ? "✅ Tasdiqlandi" : "❌ Belgilandi",
  });
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

            const chatType = msg.chat?.type;
            if (chatType === "group" || chatType === "supergroup") {
              await handleGroupMessage(chatId, tgId, text, msg.chat.title);
              return new Response("ok");
            }


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
                text: `Assalomu alaykum${from.first_name ? ", " + from.first_name : ""}! 👋\n\n🟢 Keldim — kelganingizni belgilang\n💰 Avans so'rash — avans uchun ariza\n📅 Javob so'rash — kela olmasangiz javob so'rash\n📋 Bajarilgan ishlar — bugungi ishlar hisoboti\n💵 Oyligim — oylik maoshingizni ko'rish\n⚠️ Jarimalarim — jarimalaringizni ko'rish\n🎁 Bonusim — kutilayotgan KPI bonuslaringiz${extra}`,
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
            } else if (text === "🎁 Bonusim" || text.toLowerCase() === "bonusim" || text.startsWith("/bonusim")) {
              if (!tgRow?.employee_id) {
                await tg("sendMessage", { chat_id: chatId, text: "⚠️ Akkauntingiz hali ishchiga bog'lanmagan.", reply_markup: MKB });
              } else {
                await tg("sendMessage", { chat_id: chatId, text: "🎁 Qaysi oy uchun bonusni ko'rmoqchisiz?", reply_markup: monthsKb("bon", 3) });
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

            if (data === "cash_now") {
              await handleCashNow(cq);
            } else if (data.startsWith("cash_day_")) {
              await handleCashDay(cq, data.slice(9));
            } else if (data.startsWith("cash_ok_") || data.startsWith("cash_no_")) {
              await handleCashDecision(cq, data.startsWith("cash_ok_"), data.slice(8));

            } else if (data === "face_no") {
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
            } else if (data.startsWith("sal_") || data.startsWith("fine_") || data.startsWith("bon_")) {
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
                  else if (data.startsWith("fine_")) await sendMyFines(chatId, link.employee_id, y, m);
                  else await sendMyBonus(chatId, link.employee_id, y, m);
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
