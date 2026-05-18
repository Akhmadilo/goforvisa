import { createServerFn } from "@tanstack/react-start";

const SHEET_ID = "1xRKmp5jkYN3hOdcSM6SEDZuG0a_2FaIPi-lQ2nL0IVc";
const RANGE = "Wages!A1:G500";
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

function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export const getWages = createServerFn({ method: "GET" }).handler(
  async (): Promise<WageRow[]> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");
    if (!sheetsKey) throw new Error("GOOGLE_SHEETS_API_KEY missing");

    const url = `${GATEWAY}/spreadsheets/${SHEET_ID}/values/${RANGE}?valueRenderOption=UNFORMATTED_VALUE`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey,
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) {
      throw new Error(`Sheets API failed [${res.status}]: ${await res.text()}`);
    }
    const json = (await res.json()) as { values?: unknown[][] };
    const rows = json.values ?? [];
    const out: WageRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const month = String(r[0] ?? "").trim();
      const name = String(r[1] ?? "").trim();
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
