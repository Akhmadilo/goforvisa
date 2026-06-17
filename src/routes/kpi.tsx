import { createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { Card } from "@/components/ui/card";
import { Target } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/kpi")({
  component: KpiPage,
  head: () => ({
    meta: [
      { title: "KPI — GoForVisa" },
      { name: "description", content: "Ishchilar KPI ko'rsatkichlari" },
    ],
  }),
});

function KpiPage() {
  const { t } = useT();
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:ml-56 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Target className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("nav.kpi")}</h1>
        </div>
        <Card className="p-12 text-center text-muted-foreground">
          {t("kpi.empty")}
        </Card>
      </main>
    </div>
  );
}
