import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Wallet, Receipt, Users, LineChart, FileText, Settings, Target, AlertTriangle } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { useWidgetPermissions } from "@/hooks/use-widget-permissions";
import { useT, LANGUAGES, type Lang } from "@/lib/i18n";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can, loading } = useWidgetPermissions();
  const { t, lang, setLang } = useT();

  const items = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, widget: null as string | null },
    { to: "/salaries", label: t("nav.salaries"), icon: Wallet, widget: "salaries_section" },
    { to: "/xarajatlar", label: t("nav.expenses"), icon: Receipt, widget: "expenses_section" },
    { to: "/employees", label: t("nav.employees"), icon: Users, widget: "employees_section" },
    { to: "/moliya", label: t("nav.finance"), icon: LineChart, widget: "finance_section" },
    { to: "/shartnomalar", label: t("nav.contracts"), icon: FileText, widget: "contracts_section" },
    { to: "/kpi", label: t("nav.kpi"), icon: Target, widget: "kpi_section" },
    { to: "/jarima", label: t("nav.fines"), icon: AlertTriangle, widget: "fines_section" },
  ] as const;

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-56 flex-col border-r border-border bg-card/60 backdrop-blur">
      <div className="h-16 px-4 flex items-center gap-2 border-b border-border">
        <img src={logoUrl} alt="GoForVisa" className="h-8 w-8 rounded" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">GoForVisa</div>
          <div className="text-[11px] text-muted-foreground">Platform</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map(({ to, label, icon: Icon, widget }) => {
          if (widget && !loading && !can(widget)) return null;
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
        <Link
          to="/settings"
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            pathname === "/settings"
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-secondary"
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>{t("nav.settings")}</span>
        </Link>
      </nav>
      <div className="border-t border-border p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
          {t("common.language")}
        </div>
        <div className="flex gap-1">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code as Lang)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                lang === l.code
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/70"
              }`}
              title={l.label}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
