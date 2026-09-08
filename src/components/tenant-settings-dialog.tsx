import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { getTenantSettings, saveTenantSettings } from "@/lib/platform.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

export const TENANT_MODULES: { key: string; label: string }[] = [
  { key: "salaries_section", label: "Oyliklar" },
  { key: "expenses_section", label: "Xarajatlar" },
  { key: "employees_section", label: "Xodimlar" },
  { key: "finance_section", label: "Moliyaviy hisobot" },
  { key: "contracts_section", label: "Shartnomalar" },
  { key: "kpi_section", label: "KPI" },
  { key: "fines_section", label: "Jarima" },
];

type Rules = {
  kpi_rate_per_usd?: number;
  visa_bonus_per_usd?: number;
  report_fine_uzs?: number;
  late_fine_uzs?: number;
};

export function TenantSettingsDialog({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const load = useServerFn(getTenantSettings);
  const save = useServerFn(saveTenantSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-settings", tenantId],
    queryFn: () => load({ data: { tenantId } }),
    enabled: open,
  });

  const [modules, setModules] = useState<string[]>([]);
  const [brandName, setBrandName] = useState("");
  const [logo, setLogo] = useState("");
  const [color, setColor] = useState("");
  const [currency, setCurrency] = useState("UZS");
  const [rules, setRules] = useState<Rules>({});

  useEffect(() => {
    if (!data) return;
    setModules(data.enabled_modules ?? []);
    setBrandName(data.brand_name ?? "");
    setLogo(data.brand_logo_url ?? "");
    setColor(data.brand_primary ?? "");
    setCurrency(data.currency ?? "UZS");
    setRules((data.business_rules ?? {}) as Rules);
  }, [data]);

  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          tenantId,
          enabledModules: modules,
          brandName: brandName || null,
          brandLogoUrl: logo || null,
          brandPrimary: color || null,
          currency: currency || "UZS",
          businessRules: rules as Record<string, any>,
        },
      }),
    onSuccess: () => {
      toast.success(t("tset.saved"));
      qc.invalidateQueries({ queryKey: ["tenant-settings", tenantId] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? t("tset.error")),
  });

  const toggle = (key: string, on: boolean) =>
    setModules((prev) => (on ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)));

  const num = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title={t("tset.settingsTooltip")}>
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tenantName} — {t("tset.title")}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("tset.loading")}</div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2">
              <Label>{t("tset.modules")}</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TENANT_MODULES.map((m) => (
                  <label
                    key={m.key}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={modules.includes(m.key)}
                      onCheckedChange={(v) => toggle(m.key, v === true)}
                    />
                    {t(`tset.module.${m.key}`)}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("tset.modulesHint")}
              </p>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("tset.brandName")}</Label>
                <Input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder={tenantName}
                />
              </div>
              <div>
                <Label>{t("tset.logoUrl")}</Label>
                <Input
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  placeholder="https://…/logo.png"
                />
              </div>
              <div>
                <Label>{t("tset.primaryColor")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#1f9d6b"
                  />
                  <input
                    type="color"
                    aria-label={t("tset.colorPicker")}
                    value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#1f9d6b"}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-12 rounded-md border border-border bg-background"
                  />
                </div>
              </div>
              <div>
                <Label>{t("tset.currency")}</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("tset.kpiRate")}</Label>
                <Input
                  type="number"
                  value={rules.kpi_rate_per_usd ?? ""}
                  onChange={(e) => setRules({ ...rules, kpi_rate_per_usd: num(e.target.value) })}
                  placeholder="500"
                />
              </div>
              <div>
                <Label>{t("tset.visaBonus")}</Label>
                <Input
                  type="number"
                  value={rules.visa_bonus_per_usd ?? ""}
                  onChange={(e) => setRules({ ...rules, visa_bonus_per_usd: num(e.target.value) })}
                  placeholder="250"
                />
              </div>
              <div>
                <Label>{t("tset.reportFine")}</Label>
                <Input
                  type="number"
                  value={rules.report_fine_uzs ?? ""}
                  onChange={(e) => setRules({ ...rules, report_fine_uzs: num(e.target.value) })}
                  placeholder="20000"
                />
              </div>
              <div>
                <Label>{t("tset.lateFine")}</Label>
                <Input
                  type="number"
                  value={rules.late_fine_uzs ?? ""}
                  onChange={(e) => setRules({ ...rules, late_fine_uzs: num(e.target.value) })}
                  placeholder="10000"
                />
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || isLoading}>
            {t("tset.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
