import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo.png";

/**
 * Vector (text-based) payslip PDF — A4 portrait, "book" style layout with
 * generous margins, running header/footer and signature blocks for
 * Direktor / CEO approval. Everything is real text, so printing is crisp.
 */

export interface PayslipPdfLine {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "primary" | "danger" | "muted";
}

export interface PayslipPdfTable {
  title: string;
  head: string[];
  body: string[][];
  align?: ("left" | "right")[];
}

export interface PayslipPdfData {
  filename: string;
  employee: string;
  period: string;
  position?: string;
  summary: PayslipPdfLine[];
  notes?: string[];
  tables: PayslipPdfTable[];
  footNote?: string | null;
}

const NAVY: [number, number, number] = [21, 40, 66];
const TEAL: [number, number, number] = [16, 129, 108];
const RED: [number, number, number] = [190, 40, 40];
const GREY: [number, number, number] = [110, 122, 138];
const LINE: [number, number, number] = [205, 212, 222];

// jsPDF core fonts are WinAnsi — normalise typographic punctuation.
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

const M = { left: 56, right: 56, top: 54, bottom: 64 };

export async function exportPayslipPdf(data: PayslipPdfData) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const contentW = W - M.left - M.right;
  const logo = await loadLogo();

  let y = M.top;

  const drawHeader = () => {
    if (logo) {
      try {
        pdf.addImage(logo, "PNG", M.left, M.top - 12, 38, 38);
      } catch {
        /* ignore */
      }
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(...NAVY);
    pdf.text("OYLIK HISOB VARAQASI", M.left + (logo ? 50 : 0), M.top + 6);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...GREY);
    pdf.text("GoForVisa - ish haqi hisob-kitobi", M.left + (logo ? 50 : 0), M.top + 21);

    pdf.setDrawColor(...TEAL);
    pdf.setLineWidth(1.4);
    pdf.line(M.left, M.top + 34, W - M.right, M.top + 34);
    y = M.top + 56;
  };

  const ensure = (need: number) => {
    if (y + need <= H - M.bottom) return;
    pdf.addPage();
    drawHeader();
  };

  const sectionTitle = (t: string) => {
    ensure(38);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...NAVY);
    pdf.text(tx(t), M.left, y);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.6);
    pdf.line(M.left, y + 5, W - M.right, y + 5);
    y += 20;
  };

  drawHeader();

  // ---- Identity card -------------------------------------------------
  pdf.setDrawColor(...LINE);
  pdf.setFillColor(248, 250, 252);
  pdf.setLineWidth(0.7);
  pdf.roundedRect(M.left, y, contentW, 58, 6, 6, "FD");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...GREY);
  pdf.text("XODIM", M.left + 14, y + 18);
  pdf.text("DAVR", M.left + contentW / 2 + 14, y + 18);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...NAVY);
  pdf.text(tx(data.employee), M.left + 14, y + 38);
  pdf.text(tx(data.period), M.left + contentW / 2 + 14, y + 38);
  if (data.position) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...GREY);
    pdf.text(tx(data.position), M.left + 14, y + 51);
  }
  y += 78;

  // ---- Summary -------------------------------------------------------
  sectionTitle("1. Umumiy hisob");
  autoTable(pdf, {
    startY: y,
    margin: { left: M.left, right: M.right },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 10, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: NAVY },
    columnStyles: { 0: { cellWidth: contentW - 170 }, 1: { cellWidth: 170, halign: "right" } },
    body: data.summary.map((l) => [tx(l.label), tx(l.value)]),
    didParseCell: (h) => {
      const line = data.summary[h.row.index];
      if (!line) return;
      if (h.column.index === 0 && !line.strong) h.cell.styles.textColor = GREY;
      if (line.strong) h.cell.styles.fontStyle = "bold";
      if (h.column.index === 1) {
        h.cell.styles.fontStyle = "bold";
        if (line.tone === "primary") h.cell.styles.textColor = TEAL;
        if (line.tone === "danger") h.cell.styles.textColor = RED;
        if (line.tone === "muted") h.cell.styles.textColor = GREY;
      }
      if (line.strong) h.cell.styles.fillColor = [241, 245, 249];
    },
    didDrawCell: (h) => {
      if (h.section !== "body") return;
      pdf.setDrawColor(...LINE);
      pdf.setLineWidth(0.4);
      pdf.line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height);
    },
  });
  y = (pdf as any).lastAutoTable.finalY + 16;

  for (const note of data.notes ?? []) {
    const lines = pdf.splitTextToSize(tx(note), contentW - 20);
    ensure(lines.length * 12 + 20);
    pdf.setFillColor(244, 247, 250);
    pdf.setDrawColor(...LINE);
    pdf.roundedRect(M.left, y - 10, contentW, lines.length * 12 + 16, 4, 4, "FD");
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8.6);
    pdf.setTextColor(...GREY);
    pdf.text(lines, M.left + 10, y + 2);
    y += lines.length * 12 + 20;
  }

  // ---- Detail tables --------------------------------------------------
  let idx = 2;
  for (const t of data.tables) {
    if (!t.body.length) continue;
    sectionTitle(`${idx}. ${t.title}`);
    idx += 1;
    autoTable(pdf, {
      startY: y,
      margin: { left: M.left, right: M.right, top: M.top + 56, bottom: M.bottom },
      head: [t.head.map(tx)],
      body: t.body.map((r) => r.map(tx)),
      styles: { font: "helvetica", fontSize: 9.2, cellPadding: 5, textColor: NAVY, lineColor: LINE, lineWidth: 0.4 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries(
        (t.align ?? []).map((a, i) => [i, { halign: a }]),
      ) as any,
      didParseCell: (h) => {
        if (h.section === "body" && h.row.index === t.body.length - 1) {
          h.cell.styles.fontStyle = "bold";
          h.cell.styles.fillColor = [237, 242, 247];
        }
      },
      didDrawPage: () => {
        if ((pdf as any).internal.getCurrentPageInfo().pageNumber > 1) return;
      },
    });
    y = (pdf as any).lastAutoTable.finalY + 18;
  }

  if (data.footNote) {
    const lines = pdf.splitTextToSize(tx(`Izoh: ${data.footNote}`), contentW - 20);
    ensure(lines.length * 12 + 24);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...GREY);
    pdf.text(lines, M.left, y);
    y += lines.length * 12 + 12;
  }

  // ---- Signatures -----------------------------------------------------
  ensure(120);
  y = Math.max(y + 10, H - M.bottom - 110);
  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.6);
  pdf.line(M.left, y - 14, W - M.right, y - 14);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...NAVY);
  pdf.text("TASDIQLADI", M.left, y);

  const roles = ["Direktor", "CEO", "Xodim"];
  const colW = contentW / roles.length;
  roles.forEach((role, i) => {
    const x = M.left + i * colW;
    pdf.setDrawColor(...GREY);
    pdf.setLineWidth(0.5);
    pdf.line(x, y + 44, x + colW - 24, y + 44);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...NAVY);
    pdf.text(tx(role), x, y + 58);
    pdf.setFontSize(7.6);
    pdf.setTextColor(...GREY);
    pdf.text("imzo / sana", x + colW - 84, y + 58);
  });

  // ---- Footer on every page -------------------------------------------
  const total = pdf.getNumberOfPages();
  const stamp = new Date().toLocaleString("uz-UZ");
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.5);
    pdf.line(M.left, H - M.bottom + 22, W - M.right, H - M.bottom + 22);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    pdf.text(tx(`${data.employee} - ${data.period}`), M.left, H - M.bottom + 36);
    pdf.text(tx(`Yaratildi: ${stamp}`), W / 2, H - M.bottom + 36, { align: "center" });
    pdf.text(`${p} / ${total}`, W - M.right, H - M.bottom + 36, { align: "right" });
  }

  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
