import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const adminCache = new Map<string, boolean>();

function readSessionAdmin(userId: string): boolean | null {
  try {
    const raw = sessionStorage.getItem(`gfv_admin_${userId}`);
    return raw === null ? null : raw === "1";
  } catch {
    return null;
  }
}

function writeSessionAdmin(userId: string, value: boolean) {
  try {
    sessionStorage.setItem(`gfv_admin_${userId}`, value ? "1" : "0");
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(() => {
    if (!user) return false;
    const cached = adminCache.get(user.id);
    if (cached !== undefined) return cached;
    const sess = readSessionAdmin(user.id);
    return sess ?? false;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    // Instant restore from in-memory or sessionStorage so a full page
    // refresh doesn't blank the sidebar while the role query round-trips.
    const memCached = adminCache.get(user.id);
    if (memCached !== undefined) {
      setIsAdmin(memCached);
      setLoading(false);
      return;
    }
    const sessCached = readSessionAdmin(user.id);
    if (sessCached !== null) {
      adminCache.set(user.id, sessCached);
      setIsAdmin(sessCached);
      setLoading(false);
      // Re-verify in the background; downgrade only if it changed.
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle()
        .then(({ data }) => {
          if (!mounted) return;
          const next = !!data;
          adminCache.set(user.id, next);
          writeSessionAdmin(user.id, next);
          if (next !== sessCached) setIsAdmin(next);
        });
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
        const next = !!data;
        adminCache.set(user.id, next);
        writeSessionAdmin(user.id, next);
        setIsAdmin(next);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  // Backward-compatible: returns boolean when used directly, but also exposes loading.
  return isAdmin;
}

export function useIsAdminStatus() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(() => {
    if (!user) return false;
    const cached = adminCache.get(user.id);
    if (cached !== undefined) return cached;
    const sess = readSessionAdmin(user.id);
    return sess ?? false;
  });
  const [loading, setLoading] = useState(() => {
    if (!user) return false;
    if (adminCache.has(user.id)) return false;
    return readSessionAdmin(user.id) === null;
  });

  useEffect(() => {
    let mounted = true;
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const memCached = adminCache.get(user.id);
    if (memCached !== undefined) {
      setIsAdmin(memCached);
      setLoading(false);
      return;
    }
    const sessCached = readSessionAdmin(user.id);
    if (sessCached !== null) {
      adminCache.set(user.id, sessCached);
      setIsAdmin(sessCached);
      setLoading(false);
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle()
        .then(({ data }) => {
          if (!mounted) return;
          const next = !!data;
          adminCache.set(user.id, next);
          writeSessionAdmin(user.id, next);
          if (next !== sessCached) setIsAdmin(next);
        });
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
        const next = !!data;
        adminCache.set(user.id, next);
        writeSessionAdmin(user.id, next);
        setIsAdmin(next);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  return { isAdmin, loading };
}
