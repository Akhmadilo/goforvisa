import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppSidebar } from "@/components/app-sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Bot, Send, Trash2, Save, Users, Bell, MessageSquare, Radio,
  Search, RefreshCw, CheckCircle2, AlertTriangle, Megaphone, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getBotSettings, saveBotSettings, setGroupActive, deleteGroup, sendTestMessage,
  listBotUsers, updateBotUser, deleteBotUser, getBotStatus, broadcastMessage,
  DEFAULT_PAYMENT_TEMPLATE, EMPLOYEE_FEATURES,
} from "@/lib/bot.functions";

export const Route = createFileRoute("/bot")({
  component: BotPage,
  head: () => ({
    meta: [
      { title: "Bot boshqaruvi — GoForVisa" },
      {
        name: "description",
        content: "Telegram bot boshqaruv markazi: holat, to'lov bildirishnomalari, ishchilar funksiyalari, guruhlar va foydalanuvchilar",
      },
      { property: "og:title", content: "Bot boshqaruvi — GoForVisa" },
      {
        property: "og:description",
        content: "Telegram botni to'liq boshqarish: holat, xabarnomalar, ishchilar funksiyalari, guruhlar, foydalanuvchilar",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type FormState = {
  notify_on_payment: boolean;
  notify_on_contract: boolean;
  daily_report_enabled: boolean;
  daily_report_hour: number;
  mention_bosses: boolean;
  payment_template: string;
  employee_features: Record<string, boolean>;
  welcome_text: string;
};

const DEFAULTS: FormState = {
  notify_on_payment: true,
  notify_on_contract: false,
  daily_report_enabled: true,
  daily_report_hour: 21,
  mention_bosses: true,
  payment_template: DEFAULT_PAYMENT_TEMPLATE,
  employee_features: {},
  welcome_text: "",
};

const ROLE_OPTIONS = [
  { value: "none", label: "—" },
  { value: "director", label: "Direktor" },
  { value: "ceo", label: "CEO" },
  { value: "owner", label: "Owner" },
  { value: "financier", label: "Moliyachi" },
  { value: "finance", label: "Finance" },
];

function renderPreview(tpl: string) {
  const html = tpl
    .replace(/%0A/g, "\n")
    .replace(/\{client\}/g, "Aziz Karimov (№120)")
    .replace(/\{amount\}/g, "5 000 000 so'm")
    .replace(/\{method\}/g, "💵 Naqd")
    .replace(/\{date\}/g, new Date().toISOString().slice(0, 10));
  return html
    .replace(/<b>/g, "\u0001B\u0002")
    .replace(/<\/b>/g, "\u0001/B\u0002")
    .replace(/<[^>]+>/g, "")
    .replace(/\u0001B\u0002/g, "")
    .replace(/\u0001\/B\u0002/g, "");
}

function BotPage() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const load = useServerFn(getBotSettings);
  const saveFn = useServerFn(saveBotSettings);
  const toggleFn = useServerFn(setGroupActive);
  const delFn = useServerFn(deleteGroup);
  const testFn = useServerFn(sendTestMessage);
  const loadUsers = useServerFn(listBotUsers);
  const updUserFn = useServerFn(updateBotUser);
  const delUserFn = useServerFn(deleteBotUser);
  const statusFn = useServerFn(getBotStatus);
  const castFn = useServerFn(broadcastMessage);

  const { data, isLoading } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => load(),
    staleTime: 60_000,
  });

  const { data: usersData } = useQuery({
    queryKey: ["bot-users"],
    queryFn: () => loadUsers(),
    staleTime: 60_000,
  });

  const { data: status, isFetching: statusLoading } = useQuery({
    queryKey: ["bot-status"],
    queryFn: () => statusFn(),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [saved, setSaved] = useState<FormState>(DEFAULTS);
  const [search, setSearch] = useState("");
  const [castChat, setCastChat] = useState<string>("");
  const [castText, setCastText] = useState("");

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    const next: FormState = {
      notify_on_payment: s.notify_on_payment,
      notify_on_contract: s.notify_on_contract,
      daily_report_enabled: s.daily_report_enabled,
      daily_report_hour: s.daily_report_hour,
      mention_bosses: s.mention_bosses,
      payment_template: (s.payment_template || DEFAULT_PAYMENT_TEMPLATE).replace(/%0A/g, "\n"),
      employee_features: (s.employee_features as Record<string, boolean>) || {},
      welcome_text: s.welcome_text || "",
    };
    setForm(next);
    setSaved(next);
  }, [data?.settings]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["bot-settings"] });
  const invalidateUsers = () => qc.invalidateQueries({ queryKey: ["bot-users"] });

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({ data: { ...form, welcome_text: form.welcome_text.trim() || null } }),
    onSuccess: () => { setSaved(form); invalidate(); toast.success("Saqlandi"); },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const toggleMut = useMutation({
    mutationFn: (v: { chatId: number; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Yangilandi"); },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const delMut = useMutation({
    mutationFn: (chatId: number) => delFn({ data: { chatId } }),
    onSuccess: () => { invalidate(); toast.success("O'chirildi"); },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const testMut = useMutation({
    mutationFn: (chatId: number) => testFn({ data: { chatId } }),
    onSuccess: () => toast.success("Test xabar yuborildi"),
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const castMut = useMutation({
    mutationFn: () => castFn({ data: { chatId: Number(castChat), text: castText } }),
    onSuccess: () => { setCastText(""); toast.success("Xabar yuborildi"); },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const userMut = useMutation({
    mutationFn: (v: { id: string; employeeId?: string | null; botRole?: string }) =>
      updUserFn({ data: v as any }),
    onSuccess: () => { invalidateUsers(); toast.success("Yangilandi"); },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });
  const delUserMut = useMutation({
    mutationFn: (id: string) => delUserFn({ data: { id } }),
    onSuccess: () => { invalidateUsers(); toast.success("O'chirildi"); },
    onError: (e: any) => toast.error(e?.message || "Xatolik"),
  });

  const featOn = (k: string) => form.employee_features[k] !== false;
  const setFeat = (k: string, v: boolean) =>
    setForm((f) => ({ ...f, employee_features: { ...f.employee_features, [k]: v } }));

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const groups = data?.groups ?? [];
  const activeFeatures = EMPLOYEE_FEATURES.filter((f) => featOn(f.key)).length;

  const users = usersData?.users ?? [];
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.first_name, u.last_name, u.telegram_username, String(u.telegram_id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [users, search]);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:ml-56 p-4 md:p-6 pb-24">
        <div className="flex items-center gap-3 mb-4 md:mb-6 pl-10 md:pl-0">
          <div
            className="h-9 w-9 md:h-10 md:w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Bot className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base md:text-xl font-bold leading-tight">Bot boshqaruvi</h1>
            <p className="text-xs text-muted-foreground truncate">
              Telegram bot bilan bog'liq barcha sozlamalar shu yerda
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["bot-status"] });
              invalidate();
              invalidateUsers();
            }}
          >
            <RefreshCw className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Status */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
          <Card className="p-3 md:p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              {status?.online ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              )}
              Bot holati
            </div>
            <div className="text-sm font-semibold truncate">
              {status ? (status.online ? `@${status.username ?? "bot"}` : "Ulanmagan") : "…"}
            </div>
          </Card>
          <Card className="p-3 md:p-4">
            <div className="text-xs text-muted-foreground mb-1">Faol guruhlar</div>
            <div className="text-lg font-bold">{status?.groupsCount ?? "—"}</div>
          </Card>
          <Card className="p-3 md:p-4">
            <div className="text-xs text-muted-foreground mb-1">Bog'langan ishchilar</div>
            <div className="text-lg font-bold">
              {status ? `${status.linkedCount}/${status.usersCount}` : "—"}
            </div>
          </Card>
          <Card className="p-3 md:p-4">
            <div className="text-xs text-muted-foreground mb-1">Faol funksiyalar</div>
            <div className="text-lg font-bold">
              {activeFeatures}/{EMPLOYEE_FEATURES.length}
            </div>
          </Card>
        </div>

        {status?.lastError ? (
          <Card className="p-3 mb-4 border-destructive/40 text-sm text-destructive">
            Webhook xatosi: {status.lastError}
          </Card>
        ) : null}

        {!isAdmin && (
          <Card className="p-4 mb-4 text-sm text-muted-foreground">
            Sozlamalarni faqat admin o'zgartira oladi.
          </Card>
        )}

        <Tabs defaultValue="notify">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="notify" className="gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Xabarnomalar
            </TabsTrigger>
            <TabsTrigger value="features" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Ishchi menyusi
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-1.5">
              <Radio className="h-3.5 w-3.5" /> Guruhlar
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Foydalanuvchilar
            </TabsTrigger>
          </TabsList>

          {/* --- Xabarnomalar --- */}
          <TabsContent value="notify" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-4 md:p-5 space-y-4">
              <div className="font-semibold">Bildirishnomalar</div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Har bir to'lovda guruhga xabar</Label>
                  <p className="text-xs text-muted-foreground">
                    To'lov qo'shilgan zahoti kassa guruhiga yuboriladi
                  </p>
                </div>
                <Switch
                  checked={form.notify_on_payment}
                  disabled={!isAdmin}
                  onCheckedChange={(v) => set("notify_on_payment", v)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Kunlik kassa hisoboti</Label>
                  <p className="text-xs text-muted-foreground">
                    Kun oxirida tasdiqlash tugmalari bilan hisobot
                  </p>
                </div>
                <Switch
                  checked={form.daily_report_enabled}
                  disabled={!isAdmin}
                  onCheckedChange={(v) => set("daily_report_enabled", v)}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Hisobot vaqti (soat, Toshkent)</Label>
                  <p className="text-xs text-muted-foreground">Standart: 21:00</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  className="w-24"
                  disabled={!isAdmin || !form.daily_report_enabled}
                  value={form.daily_report_hour}
                  onChange={(e) => set("daily_report_hour", Number(e.target.value) || 0)}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Rahbarlarni otmetka qilish</Label>
                  <p className="text-xs text-muted-foreground">
                    Hisobotda direktor/owner belgilanadi
                  </p>
                </div>
                <Switch
                  checked={form.mention_bosses}
                  disabled={!isAdmin || !form.daily_report_enabled}
                  onCheckedChange={(v) => set("mention_bosses", v)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Yangi shartnoma haqida xabar</Label>
                  <p className="text-xs text-muted-foreground">
                    Shartnoma yaratilganda guruhga xabar
                  </p>
                </div>
                <Switch
                  checked={form.notify_on_contract}
                  disabled={!isAdmin}
                  onCheckedChange={(v) => set("notify_on_contract", v)}
                />
              </div>
            </Card>

            <Card className="p-4 md:p-5 space-y-3">
              <div className="font-semibold">To'lov xabari matni</div>
              <Textarea
                rows={7}
                disabled={!isAdmin}
                value={form.payment_template}
                onChange={(e) => set("payment_template", e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {["{client}", "{amount}", "{method}", "{date}"].map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant="secondary"
                    disabled={!isAdmin}
                    onClick={() => set("payment_template", `${form.payment_template}${t}`)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Ko'rinishi:</div>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  {renderPreview(form.payment_template)}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!isAdmin}
                onClick={() => set("payment_template", DEFAULT_PAYMENT_TEMPLATE)}
              >
                Standart matn
              </Button>
            </Card>
          </TabsContent>

          {/* --- Ishchi menyusi --- */}
          <TabsContent value="features" className="mt-4 space-y-4">
            <Card className="p-4 md:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">Ishchilar uchun bot funksiyalari</div>
                  <p className="text-xs text-muted-foreground">
                    O'chirilgan funksiya bot menyusidan yo'qoladi va ishlamaydi.
                  </p>
                </div>
                <Badge variant="secondary">
                  {activeFeatures}/{EMPLOYEE_FEATURES.length}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {EMPLOYEE_FEATURES.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  >
                    <Label className="font-normal">{f.label}</Label>
                    <Switch
                      checked={featOn(f.key)}
                      disabled={!isAdmin}
                      onCheckedChange={(v) => setFeat(f.key, v)}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 md:p-5 space-y-2">
              <Label>Salomlashuv matni (/start)</Label>
              <Textarea
                rows={3}
                disabled={!isAdmin}
                placeholder="Assalomu alaykum! 👋"
                value={form.welcome_text}
                onChange={(e) => set("welcome_text", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Bo'sh qoldirilsa standart salomlashuv ishlatiladi.
              </p>
            </Card>
          </TabsContent>

          {/* --- Guruhlar --- */}
          <TabsContent value="groups" className="mt-4 space-y-4">
            <Card className="p-4 md:p-5">
              <div className="font-semibold mb-2">Ulangan guruhlar</div>
              <p className="text-xs text-muted-foreground mb-3">
                Botni guruhga qo'shib, u yerda <code>/kassa_on</code> buyrug'ini yuboring.
              </p>
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Yuklanmoqda…</div>
              ) : groups.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <Link2 className="h-5 w-5 mx-auto mb-2 opacity-60" />
                  Hali guruh ulanmagan.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Guruh</TableHead>
                        <TableHead>Chat ID</TableHead>
                        <TableHead>Holat</TableHead>
                        <TableHead className="text-right">Amallar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups.map((g) => (
                        <TableRow key={g.chat_id}>
                          <TableCell className="font-medium">{g.title || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{g.chat_id}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={g.is_active}
                                disabled={!isAdmin}
                                onCheckedChange={(v) =>
                                  toggleMut.mutate({ chatId: Number(g.chat_id), active: v })
                                }
                              />
                              <Badge variant={g.is_active ? "default" : "secondary"}>
                                {g.is_active ? "Faol" : "O'chirilgan"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => testMut.mutate(Number(g.chat_id))}
                            >
                              <Send className="h-4 w-4 mr-1" /> Test
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!isAdmin}
                              onClick={() => {
                                if (confirm("Guruh o'chirilsinmi?")) delMut.mutate(Number(g.chat_id));
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>

            <Card className="p-4 md:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                <div className="font-semibold">Guruhga xabar yuborish</div>
              </div>
              <Select value={castChat} onValueChange={setCastChat} disabled={!isAdmin}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Guruhni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.chat_id} value={String(g.chat_id)}>
                      {g.title || g.chat_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                rows={3}
                disabled={!isAdmin}
                placeholder="Xabar matni (HTML: <b>qalin</b>)"
                value={castText}
                onChange={(e) => setCastText(e.target.value)}
              />
              <Button
                disabled={!isAdmin || !castChat || !castText.trim() || castMut.isPending}
                onClick={() => castMut.mutate()}
              >
                <Send className="h-4 w-4 mr-1" /> Yuborish
              </Button>
            </Card>
          </TabsContent>

          {/* --- Foydalanuvchilar --- */}
          <TabsContent value="users" className="mt-4">
            <Card className="p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Users className="h-4 w-4" />
                <div className="font-semibold">Bot foydalanuvchilari</div>
                <div className="relative ml-auto w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Ism yoki ID bo'yicha qidirish"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Telegram akkauntni ishchiga bog'lang va rahbariyat rolini belgilang.
              </p>
              {filteredUsers.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {users.length === 0 ? "Hali foydalanuvchi yo'q." : "Topilmadi."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Telegram</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Ishchi</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead className="text-right">Amallar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                            {u.telegram_username ? (
                              <span className="text-muted-foreground"> @{u.telegram_username}</span>
                            ) : null}
                            {!u.employee_id ? (
                              <Badge variant="secondary" className="ml-2">Bog'lanmagan</Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.telegram_id}</TableCell>
                          <TableCell>
                            <Select
                              value={u.employee_id ?? "none"}
                              disabled={!isAdmin}
                              onValueChange={(v) =>
                                userMut.mutate({ id: u.id, employeeId: v === "none" ? null : v })
                              }
                            >
                              <SelectTrigger className="w-44">
                                <SelectValue placeholder="Tanlang" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Bog'lanmagan</SelectItem>
                                {(usersData?.employees ?? []).map((e) => (
                                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={u.bot_role || "none"}
                              disabled={!isAdmin}
                              onValueChange={(v) => userMut.mutate({ id: u.id, botRole: v })}
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!isAdmin}
                              onClick={() => {
                                if (confirm("Foydalanuvchi o'chirilsinmi?")) delUserMut.mutate(u.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Sticky save bar */}
      {isAdmin && dirty && (
        <div className="fixed bottom-0 left-0 right-0 md:left-56 z-40 border-t bg-background/95 backdrop-blur p-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Saqlanmagan o'zgarishlar bor</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setForm(saved)}>
              Bekor qilish
            </Button>
            <Button size="sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              <Save className="h-4 w-4 mr-1" /> Saqlash
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
