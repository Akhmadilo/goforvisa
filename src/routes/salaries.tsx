import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, LogOut, Shield, Search } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/salaries")({
  component: SalariesPage,
  head: () => ({
    meta: [
      { title: "Ishchilar oyliklari — GoForVisa" },
      { name: "description", content: "Ishchilar oyliklari hisob-kitobi" },
    ],
  }),
});

type Employee = {
  id: string;
  name: string;
  role?: string;
  fixed: number;
  bonus: number;
  fine: number;
};

// Placeholder data — Google Sheets integratsiyasi keyinroq ulanadi
const PLACEHOLDER: Employee[] = [];

function SalariesPage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const rows = PLACEHOLDER.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()),
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";

  const totals = rows.reduce(
    (acc, e) => {
      acc.fixed += e.fixed;
      acc.bonus += e.bonus;
      acc.fine += e.fine;
      acc.total += e.fixed + e.bonus - e.fine;
      return acc;
    },
    { fixed: 0, bonus: 0, fine: 0, total: 0 },
  );

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center"
      >
        <img
          src={logoUrl}
          alt=""
          className="w-[min(70vw,720px)] opacity-[0.05] select-none"
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
                <Wallet className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Ishchilar oyliklari
                </h1>
                <p className="text-xs text-muted-foreground">
                  Oylik = O'zgarmas oylik + Bonus − Jarima
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
          <Card className="p-4 border-dashed border-accent/40 bg-accent/5">
            <div className="text-sm">
              <span className="font-semibold">Eslatma:</span> Bu yerga
              ma'lumotlar Google Sheets'dan tortiladi. Linkni bering — manba
              ulanadi va jadval real vaqtda yangilanadi.
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami o'zgarmas</div>
              <div className="text-lg font-semibold mt-1">{fmt(totals.fixed)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami bonus</div>
              <div className="text-lg font-semibold mt-1">{fmt(totals.bonus)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami jarima</div>
              <div className="text-lg font-semibold mt-1 text-destructive">
                −{fmt(totals.fine)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Jami to'lanadigan</div>
              <div className="text-lg font-bold mt-1 text-primary">
                {fmt(totals.total)}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ishchini izlash..."
                  className="pl-8"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {rows.length} ishchi
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ishchi</TableHead>
                  <TableHead>Lavozim</TableHead>
                  <TableHead className="text-right">O'zgarmas</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Jarima</TableHead>
                  <TableHead className="text-right">Oylik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      Hozircha ma'lumot yo'q. Google Sheets manbasini ulang.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((e) => {
                    const total = e.fixed + e.bonus - e.fine;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {e.role ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">{fmt(e.fixed)}</TableCell>
                        <TableCell className="text-right text-primary">
                          +{fmt(e.bonus)}
                        </TableCell>
                        <TableCell className="text-right text-destructive">
                          −{fmt(e.fine)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmt(total)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </main>
      </div>
    </div>
  );
}
