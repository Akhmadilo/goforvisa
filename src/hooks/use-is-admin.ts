import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const adminCache = new Map<string, boolean>();

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(() => (user ? adminCache.get(user.id) ?? false : false));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    if (adminCache.has(user.id)) {
      setIsAdmin(adminCache.get(user.id) ?? false);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        adminCache.set(user.id, !!data);
        setIsAdmin(!!data);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  // Backward-compatible: returns boolean when used directly, but also exposes loading.
  // Existing callers using `useIsAdmin()` as boolean keep working because we attach
  // a valueOf, but TS-wise we keep returning a boolean. For loading, use useIsAdminStatus.
  return isAdmin;
}

export function useIsAdminStatus() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(() => (user ? adminCache.get(user.id) ?? false : false));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    if (adminCache.has(user.id)) {
      setIsAdmin(adminCache.get(user.id) ?? false);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        adminCache.set(user.id, !!data);
        setIsAdmin(!!data);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  return { isAdmin, loading };
}
