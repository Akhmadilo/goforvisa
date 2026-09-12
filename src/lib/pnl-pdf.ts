import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo.png";

/**
 * Vector (text-based) P&L (Foyda va zarar) hisoboti — A4 landscape,
 * firma emblemasi, oy nomiga mos fayl nomi bilan.
 */

export interface PnlMonthRow {
  /** "2026-09" */
  key: string;
  /** "Sentabr 2026" */
  label: string;
  revenue: number;
  docCosts: number;
  expenses: number;
  salaries: number;
  contracts: number;
}

export interface PnlCategoryRow {
  name: string;
  total: number;
}

export interface PnlPdfData {
  filename?: string;
  title?: string;
  company?: string;
  periodLabel: string;
  basisLabel: string;
  currency: "UZS" | "USD";
  months: PnlMonthRow[];
  categories: PnlCategoryRow[];
  labels: {
    revenue: string;
    docCosts: string;
    grossProfit: string;
    salaries: string;
    expenses: string;
    netProfit: string;
    contracts: string;
    margin: string;
    total: string;
    month: string;
    category: string;
    amount: string;
    share: string;
    summary: string;
    monthly: string;
    categoriesTitle: string;
    generated: string;
    page: string;
  };
}

const NAVY: [number, number, number] = [21, 40, 66];
const TEAL: [number, number, number] = [16, 129, 108];
const RED: [number, number, number] = [190, 40, 40];
const GREY: [number, number, number] = [110, 122, 138];
const LINE: [number, number, number] = [205, 212, 222];

const tx = (s: string) =>
  String(s ?? "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/−/g, "-")
    .replace(/\u00a0/g, " ");

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const M = { left: 40, right: 40, top: 46, bottom: 52 };

export async function exportPnlPdf(data: PnlPdfData) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const contentW = W - M.left - M.right;
  const logo = await loadLogo();
  const L = data.labels;
  const title = data.title || "FOYDA VA ZARAR HISOBOTI (P&L)";
  const company = data.company || "GoForVisa";

  const money = (n: number) => {
    const v = Math.round(n || 0);
    const s = Math.abs(v).toLocaleString("en-US");
    const body = data.currency === "USD" ? `$${s}` : s;
    return v < 0 ? `(${body})` : body;
  };

  const sum = (f: (m: PnlMonthRow) => number) => data.months.reduce((s, m) => s + f(m), 0);
  const revenue = sum((m) => m.revenue);
  const docCosts = sum((m) => m.docCosts);
  const expenses = sum((m) => m.expenses);
  const salaries = sum((m) => m.salaries);
  const contracts = sum((m) => m.contracts);
  const gross = revenue - docCosts;
  const net = revenue - docCosts - expenses;
  const margin = revenue > 0 ? (net / revenue) * 100 : 0;

  const drawHeader = () => {
    if (logo) {
      try {
        pdf.addImage(logo, "PNG", M.left, M.top - 12, 36, 36);
      } catch {
        /* ignore */
      }
    }
    const x = M.left + (logo ? 48 : 0);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(...NAVY);
    pdf.text(tx(title), x, M.top + 6);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...GREY);
    pdf.text(tx(`${company}  -  ${data.periodLabel}  -  ${data.basisLabel}  -  ${data.currency}`), x, M.top + 20);
    pdf.setDrawColor(...TEAL);
    pdf.setLineWidth(1.4);
    pdf.line(M.left, M.top + 30, W - M.right, M.top + 30);
  };

  drawHeader();
  let y = M.top + 52;

  // ---- Summary cards ---------------------------------------------------
  const cards: { label: string; value: string; sub?: string; accent?: [number, number, number] }[] = [
    { label: L.revenue, value: money(revenue), sub: `${contracts} ${L.contracts.toLowerCase()}`, accent: TEAL },
    { label: L.docCosts, value: money(docCosts) },
    { label: L.grossProfit, value: money(gross) },
    { label: L.expenses, value: money(expenses), sub: `${L.salaries}: ${money(salaries)}` },
    { label: L.netProfit, value: money(net), sub: `${L.margin}: ${margin.toFixed(1)}%`, accent: net >= 0 ? TEAL : RED },
  ];
  const gap = 10;
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length;
  cards.forEach((c, i) => {
    const x = M.left + i * (cardW + gap);
    pdf.setDrawColor(...LINE);
    pdf.setFillColor(c.accent ? 240 : 249, c.accent ? 249 : 250, c.accent ? 246 : 252);
    pdf.setLineWidth(0.7);
    pdf.roundedRect(x, y, cardW, 58, 5, 5, "FD");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.6);
    pdf.setTextColor(...GREY);
    pdf.text(tx(c.label), x + 10, y + 17);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(...(c.accent ?? NAVY));
    pdf.text(tx(c.value), x + 10, y + 37);
    if (c.sub) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.8);
      pdf.setTextColor(...GREY);
      pdf.text(tx(c.sub), x + 10, y + 50);
    }
  });
  y += 78;

  // ---- Monthly P&L table ----------------------------------------------
  const head = [L.month, L.revenue, L.docCosts, L.grossProfit, L.salaries, L.expenses, L.netProfit, L.margin, L.contracts];
  const body = data.months.map((m) => {
    const g = m.revenue - m.docCosts;
    const n = m.revenue - m.docCosts - m.expenses;
    const mg = m.revenue > 0 ? (n / m.revenue) * 100 : 0;
    return [m.label, money(m.revenue), money(m.docCosts), money(g), money(m.salaries), money(m.expenses), money(n), `${mg.toFixed(1)}%`, String(m.contracts)];
  });
  body.push([
    L.total,
    money(revenue),
    money(docCosts),
    money(gross),
    money(salaries),
    money(expenses),
    money(net),
    `${margin.toFixed(1)}%`,
    String(contracts),
  ]);

  autoTable(pdf, {
    startY: y,
    margin: { left: M.left, right: M.right, top: M.top + 50, bottom: M.bottom },
    head: [head.map(tx)],
    body: body.map((r) => r.map(tx)),
    styles: { font: "helvetica", fontSize: 8.8, cellPadding: 5, textColor: NAVY, lineColor: LINE, lineWidth: 0.4, overflow: "linebreak", halign: "right" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.6, halign: "right" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { halign: "left", cellWidth: 92, fontStyle: "bold" } },
    didParseCell: (h) => {
      if (h.section === "head" && h.column.index === 0) h.cell.styles.halign = "left";
      if (h.section !== "body") return;
      const isTotal = h.row.index === body.length - 1;
      if (isTotal) {
        h.cell.styles.fontStyle = "bold";
        h.cell.styles.fillColor = [237, 242, 247];
      }
      if (h.column.index === 6) {
        const raw = String(h.cell.raw ?? "");
        h.cell.styles.textColor = raw.startsWith("(") ? RED : TEAL;
        h.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => drawHeader(),
  });

  // ---- Expense categories ---------------------------------------------
  if (data.categories.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ny = ((pdf as any).lastAutoTable?.finalY ?? y) + 26;
    if (ny > H - M.bottom - 120) {
      pdf.addPage();
      drawHeader();
      ny = M.top + 52;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...NAVY);
    pdf.text(tx(L.categoriesTitle), M.left, ny);

    const cats = [...data.categories].sort((a, b) => b.total - a.total);
    const catTotal = cats.reduce((s, c) => s + c.total, 0) || 1;
    autoTable(pdf, {
      startY: ny + 8,
      margin: { left: M.left, right: M.right, top: M.top + 50, bottom: M.bottom },
      head: [[L.category, L.amount, L.share].map(tx)],
      body: cats.map((c) => [tx(c.name), money(c.total), `${((c.total / catTotal) * 100).toFixed(1)}%`]),
      styles: { font: "helvetica", fontSize: 8.6, cellPadding: 4.5, textColor: NAVY, lineColor: LINE, lineWidth: 0.4, halign: "right" },
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.4, halign: "right" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { halign: "left", cellWidth: 260 }, 1: { cellWidth: 120 }, 2: { cellWidth: 70 } },
      didParseCell: (h) => {
        if (h.column.index === 0) h.cell.styles.halign = "left";
      },
      didDrawPage: () => drawHeader(),
    });
  }

  // ---- Footer ----------------------------------------------------------
  const pages = pdf.getNumberOfPages();
  const stamp = new Date().toLocaleString("uz-UZ");
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.5);
    pdf.line(M.left, H - M.bottom + 18, W - M.right, H - M.bottom + 18);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    pdf.text(tx(`${company} - ${L.netProfit}: ${money(net)}`), M.left, H - M.bottom + 32);
    pdf.text(tx(`${L.generated}: ${stamp}`), W / 2, H - M.bottom + 32, { align: "center" });
    pdf.text(`${p} / ${pages}`, W - M.right, H - M.bottom + 32, { align: "right" });
  }

  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.filename || `P&L_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
