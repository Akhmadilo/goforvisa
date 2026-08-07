import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlatformTenant = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  note: string | null;
  created_at: string;
  users_count: number;
  contracts_count: number;
  subscription: {
    status: string;
    plan_code: string | null;
    plan_name: string | null;
    price_uzs: number;
    current_period_end: string | null;
    trial_ends_at: string | null;
  } | null;
};

async function assertPlatformAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ruxsat yo'q: faqat platforma egasi uchun");
}

export const getPlatformContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("is_platform_admin");
    return { isPlatformAdmin: !!data };
  });

export const listTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformTenant[]> => {
    await assertPlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: tenants, error }, { data: members }, { data: subs }, { data: plans }, { data: contracts }] =
      await Promise.all([
        supabaseAdmin.from("tenants").select("*").order("created_at", { ascending: true }),
        supabaseAdmin.from("tenant_members").select("tenant_id"),
        supabaseAdmin.from("subscriptions").select("*"),
        supabaseAdmin.from("plans").select("id, code, name, price_uzs"),
        supabaseAdmin.from("contracts").select("tenant_id"),
      ]);
    if (error) throw new Error(error.message);

    const userCount = new Map<string, number>();
    (members ?? []).forEach((m: any) => userCount.set(m.tenant_id, (userCount.get(m.tenant_id) ?? 0) + 1));
    const contractCount = new Map<string, number>();
    (contracts ?? []).forEach((c: any) =>
      contractCount.set(c.tenant_id, (contractCount.get(c.tenant_id) ?? 0) + 1),
    );
    const planMap = new Map((plans ?? []).map((p: any) => [p.id, p]));
    const subMap = new Map((subs ?? []).map((s: any) => [s.tenant_id, s]));

    return (tenants ?? []).map((t: any) => {
      const s: any = subMap.get(t.id);
      const p: any = s?.plan_id ? planMap.get(s.plan_id) : null;
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        is_active: t.is_active,
        contact_email: t.contact_email,
        contact_phone: t.contact_phone,
        note: t.note,
        created_at: t.created_at,
        users_count: userCount.get(t.id) ?? 0,
        contracts_count: contractCount.get(t.id) ?? 0,
        subscription: s
          ? {
              status: s.status,
              plan_code: p?.code ?? null,
              plan_name: p?.name ?? null,
              price_uzs: Number(p?.price_uzs ?? 0),
              current_period_end: s.current_period_end,
              trial_ends_at: s.trial_ends_at,
            }
          : null,
      };
    });
  });

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plans")
      .select("id, code, name, price_uzs, interval, max_users, features, is_active")
      .order("price_uzs", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(2).max(120),
        slug: z
          .string()
          .min(2)
          .max(60)
          .regex(/^[a-z0-9-]+$/, "Faqat kichik harf, raqam va tire"),
        contactEmail: z.string().email().optional().or(z.literal("")),
        contactPhone: z.string().max(40).optional().or(z.literal("")),
        planId: z.string().uuid().optional().or(z.literal("")),
        trialDays: z.number().int().min(0).max(365).default(14),
        adminEmail: z.string().email(),
        adminPassword: z.string().min(6).max(72),
        adminName: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: data.name,
        slug: data.slug,
        contact_email: data.contactEmail || null,
        contact_phone: data.contactPhone || null,
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);
    const tenantId = (tenant as any).id as string;

    const trialEnds = new Date(Date.now() + data.trialDays * 86400000);
    const { error: sErr } = await supabaseAdmin.from("subscriptions").insert({
      tenant_id: tenantId,
      plan_id: data.planId || null,
      status: data.trialDays > 0 ? "trialing" : "active",
      trial_ends_at: data.trialDays > 0 ? trialEnds.toISOString() : null,
      current_period_start: new Date().toISOString().slice(0, 10),
      current_period_end: trialEnds.toISOString().slice(0, 10),
    } as any);
    if (sErr) throw new Error(sErr.message);

    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.adminEmail,
      password: data.adminPassword,
      email_confirm: true,
      user_metadata: { display_name: data.adminName },
    });
    if (uErr) {
      await supabaseAdmin.from("tenants").delete().eq("id", tenantId);
      throw new Error(uErr.message);
    }
    const uid = created.user?.id as string;

    await supabaseAdmin.from("profiles").upsert({ id: uid, display_name: data.adminName });
    await supabaseAdmin.from("tenant_members").insert({ user_id: uid, tenant_id: tenantId, is_owner: true });
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "admin", tenant_id: tenantId } as any);

    return { ok: true, tenantId, userId: uid };
  });

export const updateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        name: z.string().min(2).max(120).optional(),
        isActive: z.boolean().optional(),
        contactEmail: z.string().max(160).optional(),
        contactPhone: z.string().max(40).optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.contactEmail !== undefined) patch.contact_email = data.contactEmail || null;
    if (data.contactPhone !== undefined) patch.contact_phone = data.contactPhone || null;
    if (data.note !== undefined) patch.note = data.note || null;
    const { error } = await supabaseAdmin.from("tenants").update(patch as never).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTenantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid().nullable(),
        status: z.enum(["trialing", "active", "past_due", "canceled"]),
        periodEnd: z.string().min(4).max(10).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        tenant_id: data.tenantId,
        plan_id: data.planId,
        status: data.status,
        current_period_end: data.periodEnd,
      } as any,
      { onConflict: "tenant_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: members } = await supabaseAdmin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", data.tenantId);
    for (const m of (members ?? []) as any[]) {
      if (m.user_id === context.userId) continue;
      await supabaseAdmin.auth.admin.deleteUser(m.user_id);
    }
    const { error } = await supabaseAdmin.from("tenants").delete().eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
