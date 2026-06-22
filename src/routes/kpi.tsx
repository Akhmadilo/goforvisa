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
      <main className="md:ml-56 p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4 md:mb-6 pl-10 md:pl-0">
          <Target className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          <h1 className="text-base md:text-xl font-bold">{t("nav.kpi")}</h1>
        </div>
        <Card className="p-8 md:p-12 text-center text-muted-foreground">
          {t("kpi.empty")}
        </Card>
      </main>
    </div>
  );
}
