import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdminStatus } from "@/hooks/use-is-admin";

// Per-user cache so remounts / route changes don't re-fetch and flicker.
const permsCache = new Map<string, Set<string>>();

/**
 * Returns the set of widget keys the current user is allowed to see.
 * - Admins always see everything (sentinel "*").
 * - Non-admins see only keys present in widget_permissions for them.
 *
 * `loading` stays true until BOTH auth and admin-role checks have resolved.
 * Callers must fail CLOSED while loading (hide gated UI), otherwise
 * restricted sections flash for everyone on refresh.
 */
export function useWidgetPermissions() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdminStatus();
  const [keys, setKeys] = useState<Set<string>>(() =>
    user ? permsCache.get(user.id) ?? new Set() : new Set(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (authLoading || adminLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setKeys(new Set());
      setLoading(false);
      return;
    }
    if (isAdmin) {
      const adminKeys = new Set(["*"]);
      permsCache.set(user.id, adminKeys);
      setKeys(adminKeys);
      setLoading(false);
      return;
    }
    const cached = permsCache.get(user.id);
    if (cached) {
      setKeys(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("widget_permissions")
      .select("widget_key")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!mounted) return;
        const next = new Set((data ?? []).map((r: any) => r.widget_key));
        permsCache.set(user.id, next);
        setKeys(next);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, isAdmin, authLoading, adminLoading]);

  const can = useCallback(
    (key: string) => !loading && (keys.has("*") || keys.has(key)),
    [keys, loading],
  );
  return { can, loading, isAdmin };
}
