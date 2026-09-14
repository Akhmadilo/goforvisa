import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type MyProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  position: string | null;
};

/** Current user's profile row (name, photo, admin-assigned position). */
export function useMyProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    queryFn: async (): Promise<MyProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, position")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as MyProfile) ?? null;
    },
  });

  return {
    ...query,
    refresh: () => qc.invalidateQueries({ queryKey: ["my-profile"] }),
  };
}

/** Resolve a stored avatar path in the private `avatars` bucket to a signed URL. */
export function useAvatarUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!stored) {
      setUrl(null);
      return;
    }
    if (/^https?:\/\//i.test(stored)) {
      setUrl(stored);
      return;
    }
    supabase.storage
      .from("avatars")
      .createSignedUrl(stored, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [stored]);
  return url;
}
