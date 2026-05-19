import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import {
  Receipt, LogOut, Shield, Search, Plus, Pencil, Trash2, Coins,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/xarajatlar")({
  component: ExpensesPage,
  head: () => ({
    meta: [
      { title: "Xarajatlar — GoForVisa" },
      { name: "description", content: "Xarajatlar va to'lovlar boshqaruvi" },
    ],
  }),
});

type Expense = {
  id: string;
  title: string;
  category: string;
  total_amount: number;
  currency: string;
  vendor: string | null;
  notes: string | null;
  status: "unpaid" | "partial" | "paid";
  expense_date: string;
  created_at: string;
};

type Payment = {
  id: string;
  expense_id: string;
  amount: number;
  payment_method: string | null;
  paid_at: string;
  note: string | null;
  created_at: string;
};

// Palette for color-coding category badges; assigned by hashing category name
const CATEGORY_PALETTE = [
  "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  "bg-lime-500/15 text-lime-600 dark:text-lime-400 border-lime-500/30",
];
function categoryColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Naqd pul" },
  { value: "bank_transfer", label: "Bank o'tkazmasi" },
  { value: "card", label: "Karta" },
];

const fmt = (n: number, currency = "UZS") =>
  new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " " + (currency === "USD" ? "$" : "so'm");

function ExpensesPage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const { can, loading: permsLoading } = useWidgetPermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && !permsLoading && user && !can("expenses_section")) {
      navigate({ to: "/" });
    }
  }, [loading, permsLoading, user, can, navigate]);

  // Filters
  const [status, setStatus] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [category, setCategory] = useState<string>("all");
  const [monthYear, setMonthYear] = useState<string>(""); // YYYY-MM
  const [query, setQuery] = useState("");

  // Data
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
    enabled: !!user,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["expense_payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_payments")
        .select("*")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
    enabled: !!user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["expense_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("name")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => r.name as string);
    },
    enabled: !!user,
  });

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("expenses-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => {
        qc.invalidateQueries({ queryKey: ["expenses"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_payments" }, () => {
        qc.invalidateQueries({ queryKey: ["expense_payments"] });
        qc.invalidateQueries({ queryKey: ["expenses"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  // Aggregated paid totals per expense
  const paidByExpense = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) {
      m.set(p.expense_id, (m.get(p.expense_id) ?? 0) + Number(p.amount));
    }
    return m;
  }, [payments]);

  // Stats
  const stats = useMemo(() => {
    const s = { total: 0, unpaid: 0, partial: 0, paid: 0 };
    for (const e of expenses) {
      const amt = Number(e.total_amount);
      s.total += amt;
      if (e.status === "unpaid") s.unpaid += amt;
      else if (e.status === "partial") s.partial += amt;
      else if (e.status === "paid") s.paid += amt;
    }
    return s;
  }, [expenses]);

  // Filtered rows
  const rows = expenses
    .filter((e) => status === "all" || e.status === status)
    .filter((e) => category === "all" || e.category === category)
    .filter((e) => {
      if (!monthYear) return true;
      return e.expense_date.startsWith(monthYear);
    })
    .filter((e) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        (e.vendor ?? "").toLowerCase().includes(q)
      );
    });

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [payExpense, setPayExpense] = useState<Expense | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Xarajatni o'chirishni xohlaysizmi?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("O'chirildi");
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%)",
          }}
        />
        <img
          src={logoUrl}
          alt=""
          className="relative w-[min(80vw,820px)] opacity-[0.12] select-none drop-shadow-[0_10px_60px_color-mix(in_oklab,var(--primary)_40%,transparent)]"
          style={{ filter: "saturate(1.1) contrast(1.05)" }}
        />
      </div>

      <div className="relative z-10 md:pl-56">
        <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-[1500px] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Receipt className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Xarajatlar</h1>
                <p className="text-xs text-muted-foreground">
                  Kompaniya xarajatlari va to'lovlari
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setAddOpen(true)}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Xarajat qo'shish</span>
              </Button>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center"
                  title="Admin"
                >
                  <Shield className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth" });
                }}
                className="h-9 w-9 rounded-md border border-border bg-card hover:bg-secondary flex items-center justify-center"
                title="Chiqish"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-6 py-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Jami xarajat" value={fmt(stats.total)} />
            <StatCard label="To'lanmagan" value={fmt(stats.unpaid)} tone="red" />
            <StatCard label="Qisman to'langan" value={fmt(stats.partial)} tone="orange" />
            <StatCard label="To'langan" value={fmt(stats.paid)} tone="green" />
          </div>

          {/* Filters */}
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {([
                ["all", "Barchasi"],
                ["unpaid", "To'lanmagan"],
                ["partial", "Qisman"],
                ["paid", "To'langan"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setStatus(k)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md border transition-colors",
                    status === k
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-secondary",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Kategoriya</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Barchasi</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Oy / Yil</label>
                <Input
                  type="month"
                  value={monthYear}
                  onChange={(e) => setMonthYear(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Qidiruv</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sarlavha yoki yetkazuvchi..."
                    className="pl-8"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Table */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Xarajatlar ro'yxati</div>
              <div className="text-xs text-muted-foreground">{rows.length} yozuv</div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sana</TableHead>
                    <TableHead>Sarlavha</TableHead>
                    <TableHead>Kategoriya</TableHead>
                    <TableHead className="text-right">Jami</TableHead>
                    <TableHead className="text-right">To'langan</TableHead>
                    <TableHead className="text-right">Qoldiq</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        Xarajatlar topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : rows.map((e) => {
                    const paid = paidByExpense.get(e.id) ?? 0;
                    const remaining = Number(e.total_amount) - paid;
                    return (
                      <TableRow
                        key={e.id}
                        className="cursor-pointer"
                        onClick={() => setDetailExpense(e)}
                      >
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {e.expense_date}
                        </TableCell>
                        <TableCell className="font-medium">{e.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border", categoryColor(e.category))}>
                            {e.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {fmt(Number(e.total_amount), e.currency)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                          {fmt(paid, e.currency)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right whitespace-nowrap",
                            remaining > 0 && "text-destructive font-semibold",
                          )}
                        >
                          {fmt(remaining, e.currency)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={e.status} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {e.status !== "paid" && (
                              <Button
                                size="sm"
                                className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => setPayExpense(e)}
                              >
                                <Coins className="h-3 w-3" /> To'lov
                              </Button>
                            )}
                            <button
                              className="h-7 w-7 rounded-md border border-border hover:bg-secondary flex items-center justify-center"
                              title="Tahrirlash"
                              onClick={() => setEditExpense(e)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="h-7 w-7 rounded-md border border-border hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
                              title="O'chirish"
                              onClick={() => handleDelete(e.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </main>
      </div>

      <ExpenseFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        expense={null}
        categories={categories}
      />
      <ExpenseFormDialog
        open={!!editExpense}
        onOpenChange={(o) => !o && setEditExpense(null)}
        expense={editExpense}
        categories={categories}
      />
      <PaymentDialog
        open={!!payExpense}
        onOpenChange={(o) => !o && setPayExpense(null)}
        expense={payExpense}
        paidSoFar={payExpense ? (paidByExpense.get(payExpense.id) ?? 0) : 0}
      />
      <ExpenseDetailDrawer
        expense={detailExpense}
        onOpenChange={(o) => !o && setDetailExpense(null)}
        payments={detailExpense ? payments.filter((p) => p.expense_id === detailExpense.id) : []}
        paidSoFar={detailExpense ? (paidByExpense.get(detailExpense.id) ?? 0) : 0}
        onAddPayment={() => {
          if (detailExpense) {
            setPayExpense(detailExpense);
            setDetailExpense(null);
          }
        }}
      />
    </div>
  );
}

function StatCard({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "orange" | "green";
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-lg font-bold",
          tone === "red" && "text-destructive",
          tone === "orange" && "text-amber-600 dark:text-amber-400",
          tone === "green" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: Expense["status"] }) {
  const map = {
    unpaid: { label: "To'lanmagan", cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", dot: "🔴" },
    partial: { label: "Qisman", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", dot: "🟠" },
    paid: { label: "To'langan", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", dot: "🟢" },
  };
  const s = map[status];
  return (
    <Badge variant="outline" className={cn("border gap-1", s.cls)}>
      <span>{s.dot}</span> {s.label}
    </Badge>
  );
}

function ExpenseFormDialog({
  open, onOpenChange, expense, categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense: Expense | null;
  categories: string[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [date, setDate] = useState(today);
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(expense?.title ?? "");
      setCategory(expense?.category ?? "Ofis");
      setTotalAmount(expense ? String(expense.total_amount) : "");
      setCurrency((expense?.currency as "UZS" | "USD") ?? "UZS");
      setDate(expense?.expense_date ?? today);
      setVendor(expense?.vendor ?? "");
      setNotes(expense?.notes ?? "");
    }
  }, [open, expense]);

  const handleSave = async () => {
    if (!title.trim() || !category || !totalAmount || !date) {
      toast.error("Majburiy maydonlarni to'ldiring");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      category,
      total_amount: Number(totalAmount),
      currency,
      vendor: vendor.trim() || null,
      notes: notes.trim() || null,
      expense_date: date,
    };
    const { error } = expense
      ? await supabase.from("expenses").update(payload).eq("id", expense.id)
      : await supabase.from("expenses").insert({ ...payload, status: "unpaid" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(expense ? "Yangilandi" : "Qo'shildi");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? "Xarajatni tahrirlash" : "Xarajat qo'shish"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Sarlavha *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Kategoriya *</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sana *</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Jami summa *</label>
              <Input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valyuta</label>
              <div className="flex gap-1">
                {(["UZS", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={cn(
                      "flex-1 h-9 rounded-md border text-sm transition-colors",
                      currency === c
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border hover:bg-secondary",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Yetkazuvchi</label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Izoh</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  open, onOpenChange, expense, paidSoFar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense: Expense | null;
  paidSoFar: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const remaining = expense ? Number(expense.total_amount) - paidSoFar : 0;

  useEffect(() => {
    if (open) {
      setAmount("");
      setMethod("cash");
      setDate(today);
      setNote("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!expense) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("To'lov summasi noto'g'ri");
      return;
    }
    if (amt > remaining + 0.001) {
      toast.error(`Qoldiqdan ko'p bo'lishi mumkin emas: ${fmt(remaining, expense.currency)}`);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("expense_payments").insert({
      expense_id: expense.id,
      amount: amt,
      payment_method: method,
      paid_at: date,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("To'lov qo'shildi");
    onOpenChange(false);
  };

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>To'lov qo'shish</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Xarajat:</span>
            <span className="font-medium">{expense.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Jami summa:</span>
            <span>{fmt(Number(expense.total_amount), expense.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">To'langan:</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              {fmt(paidSoFar, expense.currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Qoldiq:</span>
            <span className="text-destructive font-bold">{fmt(remaining, expense.currency)}</span>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">To'lov summasi *</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={remaining}
            />
            <div className="text-xs text-muted-foreground mt-1">
              Qoldiq: {fmt(remaining, expense.currency)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To'lov usuli *</label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sana *</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Izoh</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Saqlanmoqda..." : "To'lovni saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDetailDrawer({
  expense, onOpenChange, payments, paidSoFar, onAddPayment,
}: {
  expense: Expense | null;
  onOpenChange: (o: boolean) => void;
  payments: Payment[];
  paidSoFar: number;
  onAddPayment: () => void;
}) {
  if (!expense) return null;
  const total = Number(expense.total_amount);
  const remaining = total - paidSoFar;
  const pct = total > 0 ? Math.min(100, Math.round((paidSoFar / total) * 100)) : 0;
  const methodLabel = (m: string | null) =>
    PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m ?? "—";

  return (
    <Drawer open={!!expense} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            {expense.title}
            <StatusBadge status={expense.status} />
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Kategoriya" value={expense.category} />
            <Info label="Sana" value={expense.expense_date} />
            <Info label="Yetkazuvchi" value={expense.vendor ?? "—"} />
            <Info label="Jami" value={fmt(total, expense.currency)} />
          </div>
          {expense.notes && (
            <Info label="Izoh" value={expense.notes} />
          )}
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">To'langan: {fmt(paidSoFar, expense.currency)}</span>
              <span className={remaining > 0 ? "text-destructive font-semibold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>
                Qoldiq: {fmt(remaining, expense.currency)}
              </span>
            </div>
            <Progress value={pct} />
            <div className="text-xs text-muted-foreground text-right">{pct}%</div>
          </div>
          <div>
            <div className="text-sm font-semibold mb-2">To'lovlar tarixi</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sana</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead>Usul</TableHead>
                    <TableHead>Izoh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        To'lovlar yo'q
                      </TableCell>
                    </TableRow>
                  ) : payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{p.paid_at}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                        {fmt(Number(p.amount), expense.currency)}
                      </TableCell>
                      <TableCell>{methodLabel(p.payment_method)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.note ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          {expense.status !== "paid" && (
            <Button
              onClick={onAddPayment}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              <Plus className="h-4 w-4" /> To'lov qo'shish
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
