import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import logoUrl from "@/assets/logo.png";

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

export interface ExportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

const PDF_COLOR_FALLBACKS = `
  :root, .dark {
    --background: rgb(255, 255, 255) !important;
    --foreground: rgb(24, 33, 48) !important;
    --card: rgb(255, 255, 255) !important;
    --card-foreground: rgb(24, 33, 48) !important;
    --popover: rgb(255, 255, 255) !important;
    --popover-foreground: rgb(24, 33, 48) !important;
    --primary: rgb(16, 129, 108) !important;
    --primary-foreground: rgb(255, 255, 255) !important;
    --secondary: rgb(242, 245, 248) !important;
    --secondary-foreground: rgb(31, 42, 58) !important;
    --muted: rgb(246, 248, 250) !important;
    --muted-foreground: rgb(100, 116, 139) !important;
    --accent: rgb(224, 101, 45) !important;
    --accent-foreground: rgb(255, 255, 255) !important;
    --destructive: rgb(220, 38, 38) !important;
    --destructive-foreground: rgb(255, 255, 255) !important;
    --border: rgb(226, 232, 240) !important;
    --input: rgb(226, 232, 240) !important;
    --ring: rgb(16, 129, 108) !important;
    --chart-1: rgb(16, 129, 108) !important;
    --chart-2: rgb(37, 99, 235) !important;
    --chart-3: rgb(234, 88, 12) !important;
    --chart-4: rgb(147, 51, 234) !important;
    --chart-5: rgb(220, 38, 38) !important;
    --sidebar: rgb(248, 250, 252) !important;
    --sidebar-foreground: rgb(24, 33, 48) !important;
    --sidebar-primary: rgb(16, 129, 108) !important;
    --sidebar-primary-foreground: rgb(255, 255, 255) !important;
    --sidebar-accent: rgb(241, 245, 249) !important;
    --sidebar-accent-foreground: rgb(31, 42, 58) !important;
    --sidebar-border: rgb(226, 232, 240) !important;
    --sidebar-ring: rgb(16, 129, 108) !important;
    --gradient-primary: linear-gradient(135deg, rgb(16, 129, 108), rgb(37, 99, 235)) !important;
    --shadow-card: 0 4px 16px -6px rgba(15, 23, 42, 0.12) !important;
  }
`;

/**
 * Snapshot a DOM element into a beautifully paginated landscape A4 PDF.
 * - html2canvas at scale=2 for crisp charts/numbers
 * - Branded cover page (logo, title, meta, generation timestamp)
 * - Auto-paginates across pages, keeps a footer with page numbers
 * - Skips any element with data-pdf-hide or .pdf-hide class
 */
export async function exportElementToPdf(
  element: HTMLElement,
  opts: ExportOptions,
) {
  // Force light rendering so charts/text are legible on white PDF pages.
  const wasDark = document.documentElement.classList.contains("dark");
  if (wasDark) document.documentElement.classList.remove("dark");
  element.classList.add("pdf-exporting");

  try {
    // Give recharts/layout a tick to reflow.
    await new Promise((r) => setTimeout(r, 120));

    const canvas = await html2canvas(element, {
      scale: Math.min(1.8, window.devicePixelRatio > 1 ? 1.8 : 1.5),
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: Math.max(element.scrollWidth, 1400),
      onclone: (doc) => {
        const fallbackStyles = doc.createElement("style");
        fallbackStyles.textContent = PDF_COLOR_FALLBACKS;
        doc.head.appendChild(fallbackStyles);
        doc.querySelectorAll<HTMLElement>(
          "[data-pdf-hide], .pdf-hide, .print\\:hidden",
        ).forEach((el) => {
          el.style.display = "none";
        });
        // Ensure background is white in cloned doc.
        doc.documentElement.classList.remove("dark");
        const body = doc.body;
        if (body) body.style.background = "#ffffff";
      },
    });

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // ----- Cover -----
    const brand: [number, number, number] = [16, 129, 108];
    const brandDark: [number, number, number] = [10, 90, 74];
    pdf.setFillColor(...brand);
    pdf.rect(0, 0, pageW, 90, "F");
    pdf.setFillColor(...brandDark);
    pdf.rect(0, 82, pageW, 8, "F");

    const logo = await loadLogo();
    if (logo) {
      try {
        pdf.addImage(logo, "PNG", 32, 20, 50, 50);
      } catch {
        /* ignore */
      }
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("GoForVisa", 96, 44);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.text(opts.title, 96, 64);
    if (opts.subtitle) {
      pdf.setFontSize(9);
      pdf.text(opts.subtitle, 96, 80);
    }
    const genStr = new Date().toLocaleString();
    pdf.setFontSize(8);
    pdf.text(genStr, pageW - 32, 78, { align: "right" });
    if (opts.meta) {
      pdf.text(opts.meta, pageW - 32, 66, { align: "right" });
    }

    // ----- Paginated image -----
    const marginX = 24;
    const topOffset = 106; // start below the cover band
    const bottomMargin = 32;
    const usableW = pageW - marginX * 2;
    const scaledH = (canvas.height * usableW) / canvas.width;

    const firstPageAvail = pageH - topOffset - bottomMargin;
    let remainingH = scaledH;
    let yOffset = 0;
    let isFirstPage = true;

    while (remainingH > 0) {
      const availH = isFirstPage
        ? firstPageAvail
        : pageH - marginX - bottomMargin;
      const drawY = isFirstPage ? topOffset : marginX;
      const sliceH = Math.min(availH, remainingH);

      // Convert slice px in canvas coordinates
      const canvasSliceHpx = (sliceH * canvas.width) / usableW;

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.ceil(canvasSliceHpx);
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) throw new Error("PDF sahifasini chizib bo‘lmadi");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        (yOffset * canvas.width) / usableW,
        canvas.width,
        canvasSliceHpx,
        0,
        0,
        canvas.width,
        canvasSliceHpx,
      );
      const dataUrl = sliceCanvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(dataUrl, "JPEG", marginX, drawY, usableW, sliceH);

      remainingH -= sliceH;
      yOffset += sliceH;
      if (remainingH > 0.5) {
        pdf.addPage();
      }
      isFirstPage = false;
    }

    // ----- Footer on every page -----
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setDrawColor(226, 232, 240);
      pdf.line(24, pageH - 22, pageW - 24, pageH - 22);
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`GoForVisa — ${opts.title}`, 24, pageH - 10);
      pdf.text(`${p} / ${total}`, pageW - 24, pageH - 10, { align: "right" });
    }

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    window.dispatchEvent(new CustomEvent("pdf-preview-ready", {
      detail: { url, filename: opts.filename, title: opts.title },
    }));
  } finally {
    element.classList.remove("pdf-exporting");
    if (wasDark) document.documentElement.classList.add("dark");
  }
}
