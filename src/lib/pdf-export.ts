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
    --color-background: rgb(255, 255, 255) !important;
    --foreground: rgb(24, 33, 48) !important;
    --color-foreground: rgb(24, 33, 48) !important;
    --card: rgb(255, 255, 255) !important;
    --color-card: rgb(255, 255, 255) !important;
    --card-foreground: rgb(24, 33, 48) !important;
    --color-card-foreground: rgb(24, 33, 48) !important;
    --popover: rgb(255, 255, 255) !important;
    --color-popover: rgb(255, 255, 255) !important;
    --popover-foreground: rgb(24, 33, 48) !important;
    --color-popover-foreground: rgb(24, 33, 48) !important;
    --primary: rgb(16, 129, 108) !important;
    --color-primary: rgb(16, 129, 108) !important;
    --primary-foreground: rgb(255, 255, 255) !important;
    --color-primary-foreground: rgb(255, 255, 255) !important;
    --secondary: rgb(242, 245, 248) !important;
    --color-secondary: rgb(242, 245, 248) !important;
    --secondary-foreground: rgb(31, 42, 58) !important;
    --color-secondary-foreground: rgb(31, 42, 58) !important;
    --muted: rgb(246, 248, 250) !important;
    --color-muted: rgb(246, 248, 250) !important;
    --muted-foreground: rgb(100, 116, 139) !important;
    --color-muted-foreground: rgb(100, 116, 139) !important;
    --accent: rgb(224, 101, 45) !important;
    --color-accent: rgb(224, 101, 45) !important;
    --accent-foreground: rgb(255, 255, 255) !important;
    --color-accent-foreground: rgb(255, 255, 255) !important;
    --destructive: rgb(220, 38, 38) !important;
    --color-destructive: rgb(220, 38, 38) !important;
    --destructive-foreground: rgb(255, 255, 255) !important;
    --color-destructive-foreground: rgb(255, 255, 255) !important;
    --border: rgb(226, 232, 240) !important;
    --color-border: rgb(226, 232, 240) !important;
    --input: rgb(226, 232, 240) !important;
    --color-input: rgb(226, 232, 240) !important;
    --ring: rgb(16, 129, 108) !important;
    --color-ring: rgb(16, 129, 108) !important;
    --chart-1: rgb(16, 129, 108) !important;
    --color-chart-1: rgb(16, 129, 108) !important;
    --chart-2: rgb(37, 99, 235) !important;
    --color-chart-2: rgb(37, 99, 235) !important;
    --chart-3: rgb(234, 88, 12) !important;
    --color-chart-3: rgb(234, 88, 12) !important;
    --chart-4: rgb(147, 51, 234) !important;
    --color-chart-4: rgb(147, 51, 234) !important;
    --chart-5: rgb(220, 38, 38) !important;
    --color-chart-5: rgb(220, 38, 38) !important;
    --sidebar: rgb(248, 250, 252) !important;
    --color-sidebar: rgb(248, 250, 252) !important;
    --sidebar-foreground: rgb(24, 33, 48) !important;
    --color-sidebar-foreground: rgb(24, 33, 48) !important;
    --sidebar-primary: rgb(16, 129, 108) !important;
    --color-sidebar-primary: rgb(16, 129, 108) !important;
    --sidebar-primary-foreground: rgb(255, 255, 255) !important;
    --color-sidebar-primary-foreground: rgb(255, 255, 255) !important;
    --sidebar-accent: rgb(241, 245, 249) !important;
    --color-sidebar-accent: rgb(241, 245, 249) !important;
    --sidebar-accent-foreground: rgb(31, 42, 58) !important;
    --color-sidebar-accent-foreground: rgb(31, 42, 58) !important;
    --sidebar-border: rgb(226, 232, 240) !important;
    --color-sidebar-border: rgb(226, 232, 240) !important;
    --sidebar-ring: rgb(16, 129, 108) !important;
    --color-sidebar-ring: rgb(16, 129, 108) !important;
    --gradient-primary: linear-gradient(135deg, rgb(16, 129, 108), rgb(37, 99, 235)) !important;
    --shadow-card: 0 4px 16px -6px rgba(15, 23, 42, 0.12) !important;
  }

  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function isExportable(child: Element): child is HTMLElement {
  if (!(child instanceof HTMLElement)) return false;
  if (child.matches("[data-pdf-hide], .pdf-hide, .print\\:hidden")) return false;
  const style = window.getComputedStyle(child);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = child.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

/**
 * Collect printable blocks. Containers taller than one PDF page are broken down
 * into their children so charts/tables are never sliced across pages.
 */
function collectExportBlocks(
  element: HTMLElement,
  maxBlockPx: number,
  depth = 0,
): HTMLElement[] {
  const children = Array.from(element.children).filter(isExportable);
  if (children.length === 0) return [element];

  const out: HTMLElement[] = [];
  for (const child of children) {
    const h = child.getBoundingClientRect().height;
    const canSplit =
      depth < 3 &&
      h > maxBlockPx &&
      Array.from(child.children).filter(isExportable).length > 1;
    if (canSplit) {
      out.push(...collectExportBlocks(child, maxBlockPx, depth + 1));
    } else {
      out.push(child);
    }
  }
  return out.length > 0 ? out : [element];
}


function addFooter(pdf: jsPDF, title: string) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const total = pdf.getNumberOfPages();

  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(24, pageH - 22, pageW - 24, pageH - 22);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`GoForVisa — ${title}`, 24, pageH - 10);
    pdf.text(`${p} / ${total}`, pageW - 24, pageH - 10, { align: "right" });
  }
}

function addCover(pdf: jsPDF, opts: ExportOptions) {
  const pageW = pdf.internal.pageSize.getWidth();

  const brand: [number, number, number] = [16, 129, 108];
  const brandDark: [number, number, number] = [10, 90, 74];
  pdf.setFillColor(...brand);
  pdf.rect(0, 0, pageW, 90, "F");
  pdf.setFillColor(...brandDark);
  pdf.rect(0, 82, pageW, 8, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("GoForVisa", 96, 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.text(opts.title, 96, 64, { maxWidth: pageW - 230 });
  if (opts.subtitle) {
    pdf.setFontSize(9);
    pdf.text(opts.subtitle, 96, 80, { maxWidth: pageW - 230 });
  }
  const genStr = new Date().toLocaleString();
  pdf.setFontSize(8);
  pdf.text(genStr, pageW - 32, 78, { align: "right" });
  if (opts.meta) {
    pdf.text(opts.meta, pageW - 32, 66, { align: "right" });
  }
}

function addCanvasPaged(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  cursor: { y: number },
  opts: { top: number; marginX: number; bottom: number; gap: number },
) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - opts.marginX * 2;
  const maxPageContentH = pageH - opts.top - opts.bottom;
  const drawH = (canvas.height * usableW) / canvas.width;
  const remainingOnPage = pageH - opts.bottom - cursor.y;

  if (drawH <= maxPageContentH && drawH > remainingOnPage) {
    pdf.addPage();
    cursor.y = opts.top;
  }

  let sourceY = 0;
  let remainingH = drawH;
  while (remainingH > 0.5) {
    const availableH = pageH - opts.bottom - cursor.y;
    if (availableH < 40) {
      pdf.addPage();
      cursor.y = opts.top;
      continue;
    }

    const sliceH = Math.min(availableH, remainingH);
    const sourceSliceH = Math.max(1, Math.floor((sliceH * canvas.width) / usableW));
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sourceSliceH;
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) throw new Error("PDF sahifasini chizib bo‘lmadi");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sourceSliceH,
      0,
      0,
      sliceCanvas.width,
      sliceCanvas.height,
    );

    pdf.addImage(
      sliceCanvas.toDataURL("image/jpeg", 0.9),
      "JPEG",
      opts.marginX,
      cursor.y,
      usableW,
      (sourceSliceH * usableW) / canvas.width,
    );

    const usedH = (sourceSliceH * usableW) / canvas.width;
    sourceY += sourceSliceH;
    remainingH -= usedH;
    cursor.y += usedH;

    if (remainingH > 0.5) {
      pdf.addPage();
      cursor.y = opts.top;
    }
  }

  cursor.y += opts.gap;
}

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

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    addCover(pdf, opts);

    const logo = await loadLogo();
    if (logo) {
      try {
        pdf.addImage(logo, "PNG", 32, 20, 50, 50);
      } catch {
        /* ignore */
      }
    }

    const blocks = visibleExportBlocks(element);
    const cursor = { y: 106 };
    const page = { top: 24, marginX: 24, bottom: 34, gap: 12 };
    const exportWidth = Math.max(element.scrollWidth, element.clientWidth, 1200);
    const scale = Math.min(1.35, Math.max(1.1, window.devicePixelRatio || 1));

    for (const block of blocks) {
      await nextFrame();
      const canvas = await html2canvas(block, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 6000,
        removeContainer: true,
        windowWidth: exportWidth,
        ignoreElements: (node) =>
          node instanceof Element &&
          (node.matches("[data-pdf-hide], .pdf-hide, .print\\:hidden") ||
            node.closest("[data-pdf-hide], .pdf-hide, .print\\:hidden") !== null),
        onclone: (doc) => {
          const fallbackStyles = doc.createElement("style");
          fallbackStyles.textContent = PDF_COLOR_FALLBACKS;
          doc.head.appendChild(fallbackStyles);
          doc.querySelectorAll<HTMLElement>(
            "[data-pdf-hide], .pdf-hide, .print\\:hidden",
          ).forEach((el) => {
            el.style.display = "none";
          });
          doc.documentElement.classList.remove("dark");
          const body = doc.body;
          if (body) body.style.background = "#ffffff";
        },
      });

      addCanvasPaged(pdf, canvas, cursor, page);
    }

    addFooter(pdf, opts.title);

    const blob = pdf.output("blob");
    if (blob.size < 1024) throw new Error("PDF fayl yaratilmadi");
    const url = URL.createObjectURL(blob);
    window.dispatchEvent(new CustomEvent("pdf-preview-ready", {
      detail: { url, filename: opts.filename, title: opts.title },
    }));
  } finally {
    element.classList.remove("pdf-exporting");
    if (wasDark) document.documentElement.classList.add("dark");
  }
}
