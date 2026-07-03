import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface Contract {
  year: string;
  month: string;
  name: string;
  contractNo: string;
  contractDate: string;
  priceUzs: number;
  priceUsd: number;
  docsUsd: number;
  commission: number;
  payment: string;
  paidUsd: number;
  remainingUsd: number;
  people: number;
  note: string;
  type: string;
  phone: string;
  callCentre: string;
  salesManager: string;
  backOfficeManager: string;
  company: string;
  visaResult: string;
  kpiSales: number;
  kpiBackOffice: number;
  total: number;
  visaFee: number;
}

export const getContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Contract[]> => {
    const { supabase } = context;

    const [contractsRes, paymentsRes, ratesRes] = await Promise.all([
      supabase
        .from("contracts")
        .select(
          "id, year, month, client_name, contract_no, contract_date, price_uzs, price_usd, docs_usd, commission, people, note, contract_type, phone, call_centre, sales_manager, back_office_manager, company, visa_result",
        ),
      supabase.from("contract_payments").select("contract_id, amount, currency, paid_at"),
      supabase.from("usd_rates").select("year, month, rate"),
    ]);

    if (contractsRes.error) throw contractsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    if (ratesRes.error) throw ratesRes.error;

    const rateMap = new Map<string, number>();
    (ratesRes.data ?? []).forEach((r) => {
      rateMap.set(`${r.year}-${String(r.month).padStart(2, "0")}`, Number(r.rate));
    });
    const rates = (ratesRes.data ?? []).map((r) => Number(r.rate)).filter((n) => n > 0);
    const fallbackRate = rates.length ? rates[rates.length - 1] : 12700;
    const getRate = (ym: string) => rateMap.get(ym) ?? fallbackRate;

    const paidByContract = new Map<string, number>(); // USD
    (paymentsRes.data ?? []).forEach((p) => {
      const amount = Number(p.amount || 0);
      let usd = 0;
      if ((p.currency || "").toUpperCase() === "USD") {
        usd = amount;
      } else {
        const ym = (p.paid_at || "").slice(0, 7);
        const rate = getRate(ym);
        usd = rate > 0 ? amount / rate : 0;
      }
      paidByContract.set(p.contract_id, (paidByContract.get(p.contract_id) ?? 0) + usd);
    });

    const out: Contract[] = [];
    for (const c of contractsRes.data ?? []) {
      let year = (c.year ?? "").toString().trim();
      let monthRaw = (c.month ?? "").toString().trim();
      // month in DB is stored as a number ("1".."12"); dashboard expects month name.
      let month = "";
      if (monthRaw) {
        const idx = Number(monthRaw);
        if (!isNaN(idx) && idx >= 1 && idx <= 12) month = MONTH_NAMES[idx - 1];
        else if (MONTH_NAMES.includes(monthRaw)) month = monthRaw;
      }
      if ((!year || !month) && c.contract_date) {
        const d = new Date(c.contract_date);
        if (!isNaN(d.getTime())) {
          if (!year) year = String(d.getFullYear());
          if (!month) month = MONTH_NAMES[d.getMonth()];
        }
      }

      const priceUsd = Number(c.price_usd || 0);
      const priceUzs = Number(c.price_uzs || 0);
      const ymForRate = year && month
        ? `${year}-${String(MONTH_NAMES.indexOf(month) + 1 || 1).padStart(2, "0")}`
        : "";
      const totalUsd = priceUsd > 0
        ? priceUsd
        : priceUzs > 0
          ? priceUzs / getRate(ymForRate)
          : 0;
      const paidUsd = paidByContract.get(c.id) ?? 0;

      let paymentStr: string;
      if (totalUsd <= 0) paymentStr = "-";
      else if (paidUsd + 0.01 >= totalUsd) paymentStr = "Fully paid";
      else if (paidUsd > 0) paymentStr = "Partially";
      else paymentStr = "No payment";

      out.push({
        year,
        month,
        name: c.client_name ?? "",
        contractNo: c.contract_no ?? "",
        contractDate: c.contract_date ?? "",
        priceUzs,
        priceUsd,
        docsUsd: Number(c.docs_usd || 0),
        commission: Number(c.commission || 0),
        payment: paymentStr,
        people: Number(c.people || 1),
        note: c.note ?? "",
        type: c.contract_type ?? "",
        phone: c.phone ?? "",
        callCentre: c.call_centre ?? "",
        salesManager: c.sales_manager ?? "",
        backOfficeManager: c.back_office_manager ?? "",
        company: c.company ?? "",
        visaResult: c.visa_result ?? "",
        kpiSales: 0,
        kpiBackOffice: 0,
        total: 0,
        visaFee: 0,
      });
    }
    return out;
  });
