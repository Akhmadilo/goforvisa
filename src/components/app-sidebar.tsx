import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Wallet } from "lucide-react";
import logoUrl from "@/assets/logo.png";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/salaries", label: "Ishchilar oyliklari", icon: Wallet },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
        {items.map(({ to, label, icon: Icon }) => {
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
      </nav>
    </aside>
  );
}
