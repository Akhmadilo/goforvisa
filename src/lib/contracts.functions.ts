import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SHEET_ID = "1i8QxmY1pVni1Hq4tGz7YBcQOiYMAyfxWen9z92F4kpI";
const RANGE = "Mijozlar bazasi!A1:W2000";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

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

function parseNum(v: string | undefined): number {
  if (!v) return 0;
  // Strip currency labels and separators
  const cleaned = v.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export const getContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
  async (): Promise<Contract[]> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");
    if (!sheetsKey) throw new Error("GOOGLE_SHEETS_API_KEY missing");

    const url = `${GATEWAY}/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
      RANGE,
    )}`;
    // Note: Sheets accepts encoded range here too, but per docs prefer raw
    const finalUrl = `${GATEWAY}/spreadsheets/${SHEET_ID}/values/${RANGE}`;
    void url;

    const res = await fetch(finalUrl, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sheets API failed [${res.status}]: ${body}`);
    }

    const json = (await res.json()) as { values?: string[][] };
    const rows = json.values ?? [];
    if (rows.length < 2) return [];

    const data: Contract[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const name = (r[2] ?? "").trim();
      const contractNo = (r[3] ?? "").trim();
      if (!name && !contractNo) continue;

      data.push({
        year: (r[0] ?? "").trim(),
        month: (r[1] ?? "").trim(),
        name,
        contractNo,
        contractDate: (r[4] ?? "").trim(),
        priceUzs: parseNum(r[5]),
        priceUsd: parseNum(r[6]),
        docsUsd: parseNum(r[7]),
        commission: parseNum(r[8]),
        payment: (r[9] ?? "").trim(),
        people: parseNum(r[10]) || 1,
        note: (r[11] ?? "").trim(),
        type: (r[12] ?? "").trim(),
        phone: (r[13] ?? "").trim(),
        callCentre: (r[14] ?? "").trim(),
        salesManager: (r[15] ?? "").trim(),
        backOfficeManager: (r[16] ?? "").trim(),
        company: (r[17] ?? "").trim(),
        visaResult: (r[18] ?? "").trim(),
        kpiSales: parseNum(r[19]),
        kpiBackOffice: parseNum(r[20]),
        total: parseNum(r[21]),
        visaFee: parseNum(r[22]),
      });
    }
    return data;
  },
);
