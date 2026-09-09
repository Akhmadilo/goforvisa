import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

interface PdfPreviewDetail {
  url: string;
  filename: string;
  title: string;
}

export function PdfPreviewModal() {
  const { t } = useT();
  const [preview, setPreview] = useState<PdfPreviewDetail | null>(null);

  useEffect(() => {
    const showPreview = (event: Event) => {
      const detail = (event as CustomEvent<PdfPreviewDetail>).detail;
      if (!detail?.url) return;
      setPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return detail;
      });
    };

    window.addEventListener("pdf-preview-ready", showPreview);
    return () => window.removeEventListener("pdf-preview-ready", showPreview);
  }, []);

  const closePreview = () => {
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  const downloadPreview = () => {
    if (!preview?.url) return;
    const link = document.createElement("a");
    link.href = preview.url;
    link.download = preview.filename || "hisobot.pdf";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && closePreview()}>
      <DialogContent className="h-[92vh] max-w-[min(96vw,1200px)] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {t("pdf.title")}
          </DialogTitle>
          <DialogDescription>
            {preview?.title ?? t("pdf.doc")} — {t("pdf.beforeDownload")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden rounded-md border bg-muted">
          {preview && (
            <iframe
              src={preview.url}
              title={`${preview.title} ${t("pdf.title")}`}
              className="h-full w-full bg-background"
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closePreview}>{t("pdf.close")}</Button>
          {preview && (
            <Button onClick={downloadPreview}>
              <Download /> {t("pdf.download")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}