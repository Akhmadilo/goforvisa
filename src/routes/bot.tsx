import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Bot, Send, Trash2, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getBotSettings, saveBotSettings, setGroupActive, deleteGroup, sendTestMessage,
  listBotUsers, updateBotUser, deleteBotUser,
  DEFAULT_PAYMENT_TEMPLATE, EMPLOYEE_FEATURES,
} from "@/lib/bot.functions";

export const Route = createFileRoute("/bot")({
  component: BotPage,
  head: () => ({
    meta: [
      { title: "Bot sozlamalari — GoForVisa" },
      {
        name: "description",
        content: "Telegram bot: to'lov bildirishnomalari, ishchilar funksiyalari, guruhlar va bot foydalanuvchilari boshqaruvi",
      },
      { property: "og:title", content: "Bot sozlamalari — GoForVisa" },
      {
        property: "og:description",
        content: "Telegram botni to'liq boshqarish: xabarnomalar, ishchilar funksiyalari, guruhlar, foydalanuvchilar",
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

  const [form, setForm] = useState<FormState>(DEFAULTS);

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setForm({
      notify_on_payment: s.notify_on_payment,
      notify_on_contract: s.notify_on_contract,
      daily_report_enabled: s.daily_report_enabled,
      daily_report_hour: s.daily_report_hour,
      mention_bosses: s.mention_bosses,
      payment_template: (s.payment_template || DEFAULT_PAYMENT_TEMPLATE).replace(/%0A/g, "\n"),
      employee_features: (s.employee_features as Record<string, boolean>) || {},
      welcome_text: s.welcome_text || "",
    });
  }, [data?.settings]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["bot-settings"] });
  const invalidateUsers = () => qc.invalidateQueries({ queryKey: ["bot-users"] });

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({ data: { ...form, welcome_text: form.welcome_text.trim() || null } }),
    onSuccess: () => { invalidate(); toast.success("Saqlandi"); },
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

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:ml-56 p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4 md:mb-6 pl-10 md:pl-0">
          <div
            className="h-9 w-9 md:h-10 md:w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Bot className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
          </div>
          <h1 className="text-base md:text-xl font-bold">Bot</h1>
        </div>

        {!isAdmin && (
          <Card className="p-4 mb-4 text-sm text-muted-foreground">
            Sozlamalarni faqat admin o'zgartira oladi.
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 md:p-5 space-y-4">
            <div className="font-semibold">Xabarnomalar</div>

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
                disabled={!isAdmin}
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
                disabled={!isAdmin}
                onCheckedChange={(v) => set("mention_bosses", v)}
              />
            </div>

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
            <p className="text-xs text-muted-foreground">
              Belgilar: <code>{"{client}"}</code>, <code>{"{amount}"}</code>,{" "}
              <code>{"{method}"}</code>, <code>{"{date}"}</code>. HTML teglar
              (&lt;b&gt;) ishlaydi.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={!isAdmin || saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                <Save className="h-4 w-4 mr-1" /> Saqlash
              </Button>
              <Button
                variant="outline"
                disabled={!isAdmin}
                onClick={() => set("payment_template", DEFAULT_PAYMENT_TEMPLATE)}
              >
                Standart matn
              </Button>
            </div>
          </Card>
        </div>

        <Card className="p-4 md:p-5 mt-4">
          <div className="font-semibold mb-2">Ulangan guruhlar</div>
          <p className="text-xs text-muted-foreground mb-3">
            Botni guruhga qo'shib, u yerda <code>/kassa_on</code> buyrug'ini yuboring.
          </p>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Yuklanmoqda…</div>
          ) : groups.length === 0 ? (
            <div className="text-sm text-muted-foreground">Hali guruh ulanmagan.</div>
          ) : (
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
          )}
        </Card>
      </main>
    </div>
  );
}
