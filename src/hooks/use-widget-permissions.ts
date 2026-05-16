import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";

/**
 * Returns the set of widget keys the current user is allowed to see.
 * - Admins always see everything (sentinel "*").
 * - Non-admins see only keys present in widget_permissions for them.
 */
export function useWidgetPermissions() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (authLoading || adminLoading) return;
    if (!user) {
      setKeys(new Set());
      setLoading(false);
      return;
    }
    if (isAdmin) {
      setKeys(new Set(["*"]));
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
        setKeys(new Set((data ?? []).map((r: any) => r.widget_key)));
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, isAdmin, authLoading, adminLoading]);

  const can = (key: string) => keys.has("*") || keys.has(key);
  return { can, loading, isAdmin };
}
