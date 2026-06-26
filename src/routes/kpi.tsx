import { createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, PhoneCall, TrendingUp, Briefcase } from "lucide-react";
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

function SectionPlaceholder({ title, icon: Icon }: { title: string; icon: typeof PhoneCall }) {
  return (
    <Card className="p-8 md:p-12">
      <div className="flex flex-col items-center text-center gap-3 text-muted-foreground">
        <Icon className="h-10 w-10 text-primary/60" />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm max-w-md">
          Bu bo'lim uchun KPI tizimi tez orada qo'shiladi. Mezonlar va hisoblash formulalari
          aniqlanganidan keyin shu yerda ko'rsatkichlar ko'rinadi.
        </p>
      </div>
    </Card>
  );
}

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

        <Tabs defaultValue="call-centre" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="call-centre" className="gap-2">
              <PhoneCall className="h-4 w-4" />
              <span className="hidden sm:inline">Call-centre</span>
              <span className="sm:hidden">Call</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>Sales</span>
            </TabsTrigger>
            <TabsTrigger value="back-office" className="gap-2">
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Back office</span>
              <span className="sm:hidden">Back</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="call-centre" className="mt-4">
            <SectionPlaceholder title="Call-centre KPI" icon={PhoneCall} />
          </TabsContent>
          <TabsContent value="sales" className="mt-4">
            <SectionPlaceholder title="Sales KPI" icon={TrendingUp} />
          </TabsContent>
          <TabsContent value="back-office" className="mt-4">
            <SectionPlaceholder title="Back office KPI" icon={Briefcase} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
