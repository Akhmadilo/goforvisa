import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdminStatus } from "@/hooks/use-is-admin";

// Per-user cache so remounts / route changes don't re-fetch and flicker.
const permsCache = new Map<string, Set<string>>();

function readSessionPerms(userId: string): Set<string> | null {
  try {
    const raw = sessionStorage.getItem(`gfv_perms_${userId}`);
    if (!raw) return null;
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return null;
  }
}

function writeSessionPerms(userId: string, keys: Set<string>) {
  try {
    sessionStorage.setItem(`gfv_perms_${userId}`, JSON.stringify([...keys]));
  } catch {
    /* ignore */
  }
}

/**
 * Returns the set of widget keys the current user is allowed to see.
 * - Admins always see everything (sentinel "*").
 * - Non-admins see only keys present in widget_permissions for them.
 *
 * `loading` stays true until BOTH auth and admin-role checks have resolved.
 * Callers must fail CLOSED while loading (hide gated UI), otherwise
 * restricted sections flash for everyone on refresh.
 *
 * To avoid a blank sidebar on every full-page refresh, the resolved
 * permission set is mirrored to sessionStorage and restored instantly on
 * mount, then re-verified in the background.
 */
export function useWidgetPermissions() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdminStatus();
  const [keys, setKeys] = useState<Set<string>>(() => {
    if (!user) return new Set();
    const mem = permsCache.get(user.id);
    if (mem) return mem;
    const sess = readSessionPerms(user.id);
    return sess ?? new Set();
  });
  // Start "not loading" only if we already have a usable cached snapshot
  // (in-memory or sessionStorage). Otherwise we must wait for the first
  // fetch and fail closed.
  const [loading, setLoading] = useState(() => {
    if (!user) return false;
    if (permsCache.has(user.id)) return false;
    return readSessionPerms(user.id) === null;
  });

  // Which user the current `keys` snapshot belongs to. On a hard refresh the
  // initial state is computed before auth resolves (user === null), so without
  // this we could keep an EMPTY set while reporting loading=false — which
  // makes gated pages think access is denied and bounce to the dashboard.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (authLoading || adminLoading) {
      // While waiting on auth/admin, restore any snapshot we already have for
      // this user; otherwise stay fail-closed (loading) instead of showing an
      // empty permission set.
      if (user) {
        const snap = permsCache.get(user.id) ?? readSessionPerms(user.id);
        if (snap) {
          permsCache.set(user.id, snap);
          setKeys(snap);
          setHydratedFor(user.id);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } else {
        setLoading(true);
      }
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
      writeSessionPerms(user.id, adminKeys);
      setKeys(adminKeys);
      setLoading(false);
      return;
    }
    // Instant restore from cache so refresh doesn't blank the sidebar.
    const memCached = permsCache.get(user.id);
    if (memCached) {
      setKeys(memCached);
      setLoading(false);
    }
    const sessCached = readSessionPerms(user.id);
    if (sessCached && !memCached) {
      permsCache.set(user.id, sessCached);
      setKeys(sessCached);
      setLoading(false);
    }
    // Re-fetch in the background to keep the snapshot fresh.
    supabase
      .from("widget_permissions")
      .select("widget_key")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!mounted) return;
        const next = new Set((data ?? []).map((r: any) => r.widget_key));
        permsCache.set(user.id, next);
        writeSessionPerms(user.id, next);
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
