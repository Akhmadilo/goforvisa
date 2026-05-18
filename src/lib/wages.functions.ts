import { createServerFn } from "@tanstack/react-start";

const SHEET_ID = "1xRKmp5jkYN3hOdcSM6SEDZuG0a_2FaIPi-lQ2nL0IVc";
const RANGE = "Wages!A1:G500?valueRenderOption=UNFORMATTED_VALUE";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

export interface WageRow {
  month: string;
  name: string;
  fixed: number;
  penalty: number;
  kpi: number;
  total: number;
  note: string;
}

function parseNum(v: string | undefined): number {
  if (!v) return 0;
  const cleaned = v.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export const getWages = createServerFn({ method: "GET" }).handler(
  async (): Promise<WageRow[]> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");
    if (!sheetsKey) throw new Error("GOOGLE_SHEETS_API_KEY missing");

    const url = `${GATEWAY}/spreadsheets/${SHEET_ID}/values/${RANGE}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey,
      },
    });
    if (!res.ok) {
      throw new Error(`Sheets API failed [${res.status}]: ${await res.text()}`);
    }
    const json = (await res.json()) as { values?: string[][] };
    const rows = json.values ?? [];
    const out: WageRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const month = (r[0] ?? "").trim();
      const name = (r[1] ?? "").trim();
      if (!name || !month || month.toLowerCase() === "total") continue;
      out.push({
        month,
        name,
        fixed: parseNum(r[2]),
        penalty: parseNum(r[3]),
        kpi: parseNum(r[4]),
        total: parseNum(r[5]),
        note: (r[6] ?? "").trim(),
      });
    }
    return out;
  },
);
