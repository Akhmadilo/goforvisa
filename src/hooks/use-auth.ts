import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthSnapshot = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const authListeners = new Set<() => void>();
let authSnapshot: AuthSnapshot = { session: null, user: null, loading: true };
let authInitialized = false;

function setAuthSnapshot(next: AuthSnapshot) {
  authSnapshot = next;
  authListeners.forEach((listener) => listener());
}

function ensureAuthInitialized() {
  if (authInitialized) return;
  authInitialized = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    setAuthSnapshot({
      session,
      user: session?.user ?? null,
      loading: false,
    });
  });

  supabase.auth.getSession().then(({ data }) => {
    setAuthSnapshot({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    });
  });
}

export function useAuth() {
  const [state, setState] = useState<AuthSnapshot>(authSnapshot);

  useEffect(() => {
    ensureAuthInitialized();
    const listener = () => setState(authSnapshot);
    authListeners.add(listener);
    listener();
    return () => {
      authListeners.delete(listener);
    };
  }, []);

  return state;
}
