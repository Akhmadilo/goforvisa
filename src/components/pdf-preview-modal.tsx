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

interface PdfPreviewDetail {
  url: string;
  filename: string;
  title: string;
}

export function PdfPreviewModal() {
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

  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && closePreview()}>
      <DialogContent className="h-[92vh] max-w-[min(96vw,1200px)] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            PDF ko‘rinishi
          </DialogTitle>
          <DialogDescription>
            {preview?.title ?? "Hujjat"} — yuklashdan oldin sahifalarni tekshiring.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden rounded-md border bg-muted">
          {preview && (
            <iframe
              src={preview.url}
              title={`${preview.title} PDF ko‘rinishi`}
              className="h-full w-full bg-background"
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closePreview}>Yopish</Button>
          {preview && (
            <Button asChild>
              <a href={preview.url} download={preview.filename}>
                <Download /> Yuklab olish
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}