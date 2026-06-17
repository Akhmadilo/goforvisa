import { createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/jarima")({
  component: JarimaPage,
  head: () => ({
    meta: [
      { title: "Jarima — GoForVisa" },
      { name: "description", content: "Ishchilar jarimalari" },
    ],
  }),
});

function JarimaPage() {
  const { t } = useT();
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:ml-56 p-6">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("nav.fines")}</h1>
        </div>
        <Card className="p-12 text-center text-muted-foreground">
          {t("fines.empty")}
        </Card>
      </main>
    </div>
  );
}
