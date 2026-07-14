import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdminStatus } from "@/hooks/use-is-admin";

/**
 * Returns the set of widget keys the current user is allowed to see.
 * - Admins always see everything (sentinel "*").
 * - Non-admins see only keys present in widget_permissions for them.
 *
 * `loading` stays true until BOTH auth and admin-role checks have resolved,
 * so callers can safely gate redirects without race conditions.
 */
export function useWidgetPermissions() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdminStatus();
  const [keys, setKeys] = useState<Set<string>>(new Set());
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
      setKeys(adminKeys);
      setLoading(false);
      return;
    }
    const cached = widgetPermissionCache.get(user.id);
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
        const nextKeys = new Set((data ?? []).map((r: any) => r.widget_key));
        widgetPermissionCache.set(user.id, nextKeys);
        setKeys(nextKeys);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, isAdmin, authLoading, adminLoading]);

  const can = useCallback((key: string) => keys.has("*") || keys.has(key), [keys]);
  return { can, loading, isAdmin };
}

const widgetPermissionCache = new Map<string, Set<string>>();
