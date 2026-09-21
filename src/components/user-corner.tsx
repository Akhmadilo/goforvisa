import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, LogOut, Trash2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile, useAvatarUrl } from "@/hooks/use-my-profile";
import { useT } from "@/lib/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initialsOf(name: string | null | undefined, email: string | null | undefined) {
  const src = (name || email || "").trim();
  if (!src) return "?";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

/** Fixed top-right avatar with photo upload and the admin-assigned position. */
export function UserCorner() {
  const { t } = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: profile, refresh } = useMyProfile();
  const photoUrl = useAvatarUrl(profile?.avatar_url);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const name = profile?.display_name || user.email || "";

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("me.imageOnly"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("me.tooLarge"));
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: path });
      if (error) throw new Error(error.message);

      const old = profile?.avatar_url;
      if (old && !/^https?:\/\//i.test(old)) {
        await supabase.storage.from("avatars").remove([old]);
      }
      await refresh();
      toast.success(t("me.photoUpdated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      const old = profile?.avatar_url;
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: null });
      if (error) throw new Error(error.message);
      if (old && !/^https?:\/\//i.test(old)) {
        await supabase.storage.from("avatars").remove([old]);
      }
      await refresh();
      toast.success(t("me.photoRemoved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed top-3 right-3 z-40 pointer-events-none">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("me.profile")}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/90 py-1 pl-1 pr-3 shadow-sm backdrop-blur transition-colors hover:bg-secondary"
          >
            <Avatar className="h-8 w-8">
              {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
              <AvatarFallback className="text-xs">
                {initialsOf(profile?.display_name, user.email)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:block max-w-[160px] text-left leading-tight">
              <span className="block truncate text-xs font-medium">{name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {profile?.position || t("me.noPosition")}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="px-2 py-2">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {profile?.position || t("me.noPosition")}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {t("me.positionHint")}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} onSelect={(e) => { e.preventDefault(); fileRef.current?.click(); }}>
            <Camera className="mr-2 h-4 w-4" />
            {busy ? t("me.uploading") : t("me.changePhoto")}
          </DropdownMenuItem>
          {profile?.avatar_url && (
            <DropdownMenuItem
              disabled={busy}
              onSelect={(e) => { e.preventDefault(); void handleRemove(); }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("me.removePhoto")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate({ to: "/settings" })}>
            <UserIcon className="mr-2 h-4 w-4" />
            {t("nav.settings")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("common.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
