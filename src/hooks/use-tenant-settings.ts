import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type TenantSettingsRow = {
  tenant_id: string;
  enabled_modules: string[];
  brand_name: string | null;
  brand_logo_url: string | null;
  brand_primary: string | null;
  currency: string;
  business_rules: Record<string, any>;
};

/**
 * Settings of the current user's company. Row-level security already scopes the
 * read to the caller's tenant, so no filter is needed here.
 */
export function useTenantSettings() {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<TenantSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (authLoading) return;
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("tenant_settings")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        setSettings((data as unknown as TenantSettingsRow) ?? null);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  const moduleEnabled = (key: string | null) =>
    !key || !settings || !settings.enabled_modules?.length
      ? true
      : settings.enabled_modules.includes(key);

  return { settings, loading, moduleEnabled };
}
