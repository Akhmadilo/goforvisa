import { createClient } from "@supabase/supabase-js";

/**
 * Verifies the private shared secret used by scheduled (pg_cron) callers.
 * Accepts either the CRON_SECRET env var or the service-role-only
 * `public.cron_secrets` row named 'hooks'. The public anon key is NOT accepted.
 */
export async function verifyCronSecret(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-hook-secret") || "";
  if (!provided) return false;

  const envSecret = process.env.CRON_SECRET;
  if (envSecret && provided === envSecret) return true;

  try {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await sb
      .from("cron_secrets")
      .select("secret")
      .eq("name", "hooks")
      .maybeSingle();
    const stored = (data as { secret?: string } | null)?.secret;
    return !!stored && provided === stored;
  } catch {
    return false;
  }
}
