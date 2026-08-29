import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type BotSettings = {
  tenant_id: string;
  notify_on_payment: boolean;
  notify_on_contract: boolean;
  daily_report_enabled: boolean;
  daily_report_hour: number;
  mention_bosses: boolean;
  payment_template: string;
  employee_features: Record<string, boolean>;
  welcome_text: string | null;
};

export const EMPLOYEE_FEATURES = [
  { key: "attendance", label: "🟢 Keldim (davomat)" },
  { key: "advance", label: "💰 Avans so'rash" },
  { key: "leave", label: "📅 Javob so'rash" },
  { key: "work_report", label: "📋 Bajarilgan ishlar" },
  { key: "salary", label: "💵 Oyligim" },
  { key: "fines", label: "⚠️ Jarimalarim" },
  { key: "bonus", label: "🎁 Bonusim" },
  { key: "contracts", label: "📄 Shartnomalar (rahbariyat)" },
] as const;

export type BotUser = {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  employee_id: string | null;
  bot_role: string;
};

export type BotGroup = {
  chat_id: number;
  tenant_id: string;
  title: string | null;
  kind: string;
  is_active: boolean;
};

export const DEFAULT_PAYMENT_TEMPLATE =
  "💰 <b>Yangi to'lov</b>\n👤 {client}\n💵 {amount}\n🏷 {method}\n🗓 {date}";

const METHOD_LABEL: Record<string, string> = {
  cash: "💵 Naqd",
  naqd: "💵 Naqd",
  card: "💳 Karta",
  plastik: "💳 Karta",
  bank: "🏦 Bank",
  transfer: "🏦 O'tkazma",
};

function methodLabel(m: string | null | undefined): string {
  if (!m) return "💵 Naqd";
  return METHOD_LABEL[m.toLowerCase().trim()] || m;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
}

async function tg(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    console.error("telegram send failed", e);
    return { ok: false };
  }
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---- Settings ----
export const getBotSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context.supabase;
    const { data: settings } = await c.from("bot_settings").select("*").maybeSingle();
    const { data: groups } = await c
      .from("telegram_groups")
      .select("chat_id, tenant_id, title, kind, is_active")
      .order("created_at", { ascending: true });
    return {
      settings: (settings as BotSettings | null) ?? null,
      groups: (groups ?? []) as BotGroup[],
    };
  });

export const saveBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<BotSettings>) =>
    z
      .object({
        notify_on_payment: z.boolean(),
        notify_on_contract: z.boolean(),
        daily_report_enabled: z.boolean(),
        daily_report_hour: z.number().int().min(0).max(23),
        mention_bosses: z.boolean(),
        payment_template: z.string().trim().min(1).max(1000),
        employee_features: z.record(z.string(), z.boolean()).default({}),
        welcome_text: z.string().trim().max(1000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isAdmin } = await c.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Faqat admin o'zgartira oladi");
    const { data: tenantId } = await c.rpc("current_tenant_id");
    if (!tenantId) throw new Error("Kompaniya topilmadi");
    const { error } = await c
      .from("bot_settings")
      .upsert({ tenant_id: tenantId as string, ...data }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Groups ----
export const setGroupActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number; active: boolean }) =>
    z.object({ chatId: z.number(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isAdmin } = await c.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Faqat admin o'zgartira oladi");
    const { error } = await c
      .from("telegram_groups")
      .update({ is_active: data.active })
      .eq("chat_id", data.chatId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number }) => z.object({ chatId: z.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isAdmin } = await c.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Faqat admin o'chira oladi");
    const { error } = await c.from("telegram_groups").delete().eq("chat_id", data.chatId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number }) => z.object({ chatId: z.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: grp } = await c
      .from("telegram_groups")
      .select("chat_id")
      .eq("chat_id", data.chatId)
      .maybeSingle();
    if (!grp) throw new Error("Guruh topilmadi");
    const res: any = await tg("sendMessage", {
      chat_id: data.chatId,
      text: "🤖 Test xabar — bot ushbu guruhga muvaffaqiyatli ulangan.",
      parse_mode: "HTML",
    });
    if (!res?.ok) throw new Error("Xabar yuborilmadi (bot guruhda emas?)");
    return { ok: true };
  });

export const broadcastMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number; text: string }) =>
    z.object({ chatId: z.number(), text: z.string().trim().min(1).max(3000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isAdmin } = await c.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Faqat admin yubora oladi");
    const { data: grp } = await c
      .from("telegram_groups")
      .select("chat_id")
      .eq("chat_id", data.chatId)
      .maybeSingle();
    if (!grp) throw new Error("Guruh topilmadi");
    const res: any = await tg("sendMessage", {
      chat_id: data.chatId,
      text: data.text,
      parse_mode: "HTML",
    });
    if (!res?.ok) throw new Error(res?.description || "Xabar yuborilmadi");
    return { ok: true };
  });

// ---- Bot holati ----
export const getBotStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context.supabase;
    const me: any = await tg("getMe", {});
    const hook: any = await tg("getWebhookInfo", {});
    const { count: usersCount } = await c
      .from("employee_telegram")
      .select("id", { count: "exact", head: true });
    const { count: linkedCount } = await c
      .from("employee_telegram")
      .select("id", { count: "exact", head: true })
      .not("employee_id", "is", null);
    const { count: groupsCount } = await c
      .from("telegram_groups")
      .select("chat_id", { count: "exact", head: true })
      .eq("is_active", true);
    return {
      online: !!me?.ok,
      username: (me?.result?.username as string | undefined) ?? null,
      webhookUrl: (hook?.result?.url as string | undefined) ?? null,
      pending: (hook?.result?.pending_update_count as number | undefined) ?? 0,
      lastError: (hook?.result?.last_error_message as string | undefined) ?? null,
      usersCount: usersCount ?? 0,
      linkedCount: linkedCount ?? 0,
      groupsCount: groupsCount ?? 0,
    };
  });



// ---- Instant payment notification ----
export const notifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    contractId: string;
    amount: number;
    currency: string;
    method?: string | null;
    paidAt: string;
  }) =>
    z
      .object({
        contractId: z.string().uuid(),
        amount: z.number(),
        currency: z.string().max(10),
        method: z.string().max(50).nullable().optional(),
        paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: settings } = await c
      .from("bot_settings")
      .select("notify_on_payment, payment_template")
      .maybeSingle();
    if (settings && settings.notify_on_payment === false) return { ok: true, sent: 0 };

    const { data: groups } = await c
      .from("telegram_groups")
      .select("chat_id")
      .eq("kind", "daily_cash")
      .eq("is_active", true);
    if (!groups?.length) return { ok: true, sent: 0 };

    const { data: ctr } = await c
      .from("contracts")
      .select("client_name, contract_no")
      .eq("id", data.contractId)
      .maybeSingle();

    const client =
      (ctr?.client_name as string | undefined) ??
      "Noma'lum mijoz";
    const clientLabel = ctr?.contract_no ? `${client} (№${ctr.contract_no})` : client;
    const amountLabel =
      (data.currency || "UZS").toUpperCase() === "USD"
        ? `$${fmt(data.amount)}`
        : `${fmt(data.amount)} so'm`;

    const tpl = (settings?.payment_template as string) || DEFAULT_PAYMENT_TEMPLATE;
    const text = tpl
      .replace(/%0A/g, "\n")
      .replace(/\{client\}/g, esc(clientLabel))
      .replace(/\{amount\}/g, amountLabel)
      .replace(/\{method\}/g, methodLabel(data.method))
      .replace(/\{date\}/g, data.paidAt);

    let sent = 0;
    for (const g of groups as { chat_id: number }[]) {
      const res: any = await tg("sendMessage", {
        chat_id: g.chat_id,
        text,
        parse_mode: "HTML",
      });
      if (res?.ok) sent++;
    }
    return { ok: true, sent };
  });

// ---- Bot foydalanuvchilari (ishchi ↔ telegram) ----
export const listBotUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context.supabase;
    const { data: users } = await c
      .from("employee_telegram")
      .select("id, telegram_id, telegram_username, first_name, last_name, employee_id, bot_role")
      .order("created_at", { ascending: true });
    const { data: employees } = await c
      .from("employees")
      .select("id, full_name")
      .is("terminated_at", null)
      .order("full_name");
    return {
      users: (users ?? []) as BotUser[],
      employees: (employees ?? []) as { id: string; full_name: string }[],
    };
  });

export const updateBotUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; employeeId?: string | null; botRole?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        employeeId: z.string().uuid().nullable().optional(),
        botRole: z
          .enum(["none", "director", "finance", "owner", "ceo", "financier"])
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isAdmin } = await c.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Faqat admin o'zgartira oladi");
    const patch: {
      employee_id?: string | null;
      linked_at?: string | null;
      bot_role?: "none" | "director" | "finance" | "owner" | "ceo" | "financier";
    } = {};
    if (data.employeeId !== undefined) {
      patch.employee_id = data.employeeId;
      patch.linked_at = data.employeeId ? new Date().toISOString() : null;
    }
    if (data.botRole !== undefined) patch.bot_role = data.botRole;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await c.from("employee_telegram").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBotUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context.supabase;
    const { data: isAdmin } = await c.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Faqat admin o'chira oladi");
    const { error } = await c.from("employee_telegram").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
