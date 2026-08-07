import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
  widgets: string[];
};

async function currentTenantId(supabase: any): Promise<string> {
  const { data, error } = await supabase.rpc("current_tenant_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Kompaniya aniqlanmadi");
  return data as string;
}

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ruxsat yo'q: faqat admin uchun");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await assertAdmin(context.supabase, context.userId);
    const tenantId = await currentTenantId(context.supabase);

    const { data: list, error: lErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (lErr) throw new Error(lErr.message);

    const { data: memberRows } = await supabaseAdmin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", tenantId);
    const memberIds = new Set((memberRows ?? []).map((m: any) => m.user_id));
    const users = list.users.filter((u) => memberIds.has(u.id));

    const ids = users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }, { data: widgets }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("widget_permissions").select("user_id, widget_key").in("user_id", ids),
    ]);

    const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
    const rMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rMap.get(r.user_id) ?? [];
      arr.push(r.role);
      rMap.set(r.user_id, arr);
    });
    const wMap = new Map<string, string[]>();
    (widgets ?? []).forEach((w: any) => {
      const arr = wMap.get(w.user_id) ?? [];
      arr.push(w.widget_key);
      wMap.set(w.user_id, arr);
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      display_name: pMap.get(u.id) ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      roles: rMap.get(u.id) ?? [],
      widgets: wMap.get(u.id) ?? [],
    }));
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6).max(72),
        displayName: z.string().min(1).max(120),
        widgets: z.array(z.string().min(1).max(80)).max(50).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenantId = await currentTenantId(context.supabase);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Yaratib bo'lmadi");

    // Ensure profile name set
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: newId, display_name: data.displayName });

    await supabaseAdmin
      .from("tenant_members")
      .insert({ user_id: newId, tenant_id: tenantId } as any);

    if (data.widgets.length > 0) {
      const rows = data.widgets.map((w) => ({ user_id: newId, widget_key: w, tenant_id: tenantId }));
      const { error: wErr } = await supabaseAdmin
        .from("widget_permissions")
        .insert(rows);
      if (wErr) throw new Error(wErr.message);
    }

    return { ok: true, userId: newId };
  });

export const setUserWidgets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        widgets: z.array(z.string().min(1).max(80)).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenantId = await currentTenantId(context.supabase);
    const { error: dErr } = await supabaseAdmin
      .from("widget_permissions")
      .delete()
      .eq("user_id", data.userId)
      .eq("tenant_id", tenantId);
    if (dErr) throw new Error(dErr.message);
    if (data.widgets.length > 0) {
      const rows = data.widgets.map((w) => ({ user_id: data.userId, widget_key: w, tenant_id: tenantId }));
      const { error } = await supabaseAdmin
        .from("widget_permissions")
        .insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "user"]),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenantId = await currentTenantId(context.supabase);
    if (data.enabled) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role, tenant_id: tenantId } as any);
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      if (data.userId === context.userId && data.role === "admin") {
        throw new Error("O'zingizdan admin rolini olib tashlay olmaysiz");
      }
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) {
      throw new Error("O'zingizni o'chira olmaysiz");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(6).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
