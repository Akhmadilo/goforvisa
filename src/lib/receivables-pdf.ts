import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo.png";

/**
 * Vector (text-based) "Qarzdorlar ro'yxati" PDF — A4 landscape, book-style
 * layout with summary cards per aging bucket and a full debtors table.
 */

export interface ReceivableRow {
  client: string;
  contractNo: string;
  date: string;
  phone?: string;
  manager?: string;
  days: number;
  bucket: string;
  totalUsd: number;
  paidUsd: number;
  remainingUsd: number;
}

export interface ReceivablesBucketSummary {
  label: string;
  count: number;
  total: number;
}

export interface ReceivablesPdfData {
  filename?: string;
  title?: string;
  subtitle?: string;
  buckets: ReceivablesBucketSummary[];
  rows: ReceivableRow[];
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

const usd = (n: number) => `$${Math.round(n || 0).toLocaleString("en-US")}`;

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

export async function exportReceivablesPdf(data: ReceivablesPdfData) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const contentW = W - M.left - M.right;
  const logo = await loadLogo();
  const title = data.title || "QARZDORLAR RO'YXATI";
  const grand = data.rows.reduce((s, r) => s + (r.remainingUsd || 0), 0);

  const drawHeader = () => {
    if (logo) {
      try {
        pdf.addImage(logo, "PNG", M.left, M.top - 10, 34, 34);
      } catch {
        /* ignore */
      }
    }
    const x = M.left + (logo ? 46 : 0);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(...NAVY);
    pdf.text(tx(title), x, M.top + 6);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...GREY);
    pdf.text(tx(data.subtitle || "GoForVisa - Aged receivables hisoboti"), x, M.top + 20);
    pdf.setDrawColor(...TEAL);
    pdf.setLineWidth(1.4);
    pdf.line(M.left, M.top + 30, W - M.right, M.top + 30);
  };

  drawHeader();
  let y = M.top + 52;

  // ---- Summary cards ---------------------------------------------------
  const cards = [{ label: "Jami qarzdorlik", count: data.rows.length, total: grand }, ...data.buckets];
  const gap = 10;
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length;
  cards.forEach((c, i) => {
    const x = M.left + i * (cardW + gap);
    pdf.setDrawColor(...LINE);
    pdf.setFillColor(i === 0 ? 240 : 249, i === 0 ? 249 : 250, i === 0 ? 246 : 252);
    pdf.setLineWidth(0.7);
    pdf.roundedRect(x, y, cardW, 54, 5, 5, "FD");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.6);
    pdf.setTextColor(...GREY);
    pdf.text(tx(c.label), x + 10, y + 17);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(...(i === 0 ? TEAL : NAVY));
    pdf.text(usd(c.total), x + 10, y + 36);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    pdf.text(`${c.count} ta shartnoma`, x + 10, y + 48);
  });
  y += 72;

  // ---- Table -----------------------------------------------------------
  const head = ["#", "Mijoz", "Shartnoma", "Sana", "Telefon", "Menejer", "Kun", "Guruh", "Summa", "To'langan", "Qoldiq"];
  const body = data.rows.map((r, i) => [
    String(i + 1),
    r.client || "-",
    r.contractNo || "-",
    r.date || "-",
    r.phone || "-",
    r.manager || "-",
    String(r.days),
    r.bucket,
    usd(r.totalUsd),
    usd(r.paidUsd),
    usd(r.remainingUsd),
  ]);
  body.push(["", "JAMI", "", "", "", "", "", `${data.rows.length} ta`, "", "", usd(grand)]);

  autoTable(pdf, {
    startY: y,
    margin: { left: M.left, right: M.right, top: M.top + 50, bottom: M.bottom },
    head: [head.map(tx)],
    body: body.map((r) => r.map(tx)),
    styles: { font: "helvetica", fontSize: 8.6, cellPadding: 4.5, textColor: NAVY, lineColor: LINE, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.4 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 26, halign: "right", textColor: GREY },
      1: { cellWidth: 130 },
      2: { cellWidth: 72 },
      3: { cellWidth: 60 },
      4: { cellWidth: 78 },
      5: { cellWidth: 90 },
      6: { cellWidth: 34, halign: "right" },
      7: { cellWidth: 58 },
      8: { cellWidth: 62, halign: "right" },
      9: { cellWidth: 62, halign: "right" },
      10: { cellWidth: 66, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (h) => {
      if (h.section !== "body") return;
      const isTotal = h.row.index === body.length - 1;
      if (isTotal) {
        h.cell.styles.fontStyle = "bold";
        h.cell.styles.fillColor = [237, 242, 247];
      }
      if (h.column.index === 10) h.cell.styles.textColor = RED;
      if (h.column.index === 6 && !isTotal) {
        const d = data.rows[h.row.index]?.days ?? 0;
        if (d > 90) h.cell.styles.textColor = RED;
      }
    },
    didDrawPage: () => {
      drawHeader();
    },
  });

  // ---- Footer ----------------------------------------------------------
  const total = pdf.getNumberOfPages();
  const stamp = new Date().toLocaleString("uz-UZ");
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.5);
    pdf.line(M.left, H - M.bottom + 18, W - M.right, H - M.bottom + 18);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    pdf.text(tx(`${title} - jami ${usd(grand)}`), M.left, H - M.bottom + 32);
    pdf.text(tx(`Yaratildi: ${stamp}`), W / 2, H - M.bottom + 32, { align: "center" });
    pdf.text(`${p} / ${total}`, W - M.right, H - M.bottom + 32, { align: "right" });
  }

  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.filename || `Qarzdorlar_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
