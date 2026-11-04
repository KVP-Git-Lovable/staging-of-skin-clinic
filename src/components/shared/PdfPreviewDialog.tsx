import { useEffect, useRef, useState } from "react";
import { Loader2, Download, FileText, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * A PDF shown in the page, because opening one in a tab does not survive
 * contact with the clinic's browsers.
 *
 * What was measured there, across the prescription and the invoice: opening
 * a tab works, writing a placeholder document into it works - staff could
 * read "Preparing the invoice..." - and then navigating that tab to the
 * finished PDF never completes. A blob: address came back with
 * ERR_BLOCKED_BY_CLIENT, which is an extension refusing it; an https one
 * simply hung on the placeholder. Navigation is the step that fails, so
 * nothing here navigates.
 *
 * Open in new tab remains as a button. A click on it is the user's own
 * gesture on a plain link, which is the one form of this that is never
 * interfered with - and it is a choice, not something to sit and wait on.
 */
export interface PdfPreviewDialogProps {
  /**
   * The document's pages, already drawn (see renderPdf.ts). Preferred over
   * `url`, because showing these asks the browser to load nothing.
   */
  pages?: string[] | null;
  open: boolean;
  onClose: () => void;
  title: string;
  /** Message shown while the document is being built. */
  preparing: string;
  /** An https address for the finished PDF. */
  url?: string | null;
  /** A document we built ourselves, shown when there is no PDF to point at. */
  html?: string | null;
  /** A hard failure: replaces the document, because there is none to show. */
  error?: string | null;
  /**
   * Shown above a document that IS there - the fallback copy, with the reason
   * the real one could not be reached. The error slot cannot carry this: it
   * takes the content's place and hides Print, and the clinic still has a
   * patient waiting for a bill.
   */
  notice?: string | null;
  onRetry?: () => void;
  onDownload?: () => void;
  downloading?: boolean;
  /**
   * Send it to the printer as soon as it is drawn, without waiting to be asked.
   *
   * For a Print button that sits somewhere else - a list row - where pressing
   * it already said what was wanted. The dialog still appears, because the
   * document takes a second or two to build and the clinic needs to see that
   * something is happening; and if they cancel the print sheet, what they
   * asked for is on screen rather than gone.
   */
  autoPrint?: boolean;
}

export function PdfPreviewDialog({
  open, onClose, title, preparing, pages, url, html, error, notice, onRetry, onDownload, downloading,
  autoPrint,
}: PdfPreviewDialogProps) {
  const printFrame = useRef<HTMLIFrameElement | null>(null);
  /** Auto-print fires once per opening, not once per render. */
  const printedFor = useRef<string[] | null>(null);
  const [readyFrame, setReadyFrame] = useState<{ pages: string[]; document: Document } | null>(null);
  const pagesReady = !!pages && readyFrame?.pages === pages;

  const printPages = async () => {
    // The drawn pages are printed from a frame carrying them as its own
    // document, via srcdoc. No window is opened and nothing is navigated to,
    // which are the two things that get blocked.
    const frame = printFrame.current;
    if (!frame?.contentWindow || !pagesReady || frame.contentDocument !== readyFrame?.document) return;
    // The pages are images inside that frame, and printing before they have
    // decoded prints blank sheets. By hand that was hidden - the dialog had
    // been on screen for a while - but auto-print asks the moment the frame
    // exists, so the wait has to be real.
    const images = Array.from(frame.contentDocument?.images ?? []);
    await Promise.all(
      images
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
        ),
    );
    if (printFrame.current !== frame || frame.contentDocument !== readyFrame?.document) return;
    if (images.length !== pages?.length || images.some((img) => !img.complete || img.naturalWidth === 0)) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  // Forgotten when the dialog closes, so the next opening prints again.
  useEffect(() => {
    if (!open) {
      printedFor.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!autoPrint || !open || error || !pagesReady) return;
    if (!pages || pages.length === 0) return;
    if (printFrame.current?.contentDocument !== readyFrame?.document) return;
    if (printedFor.current === pages) return;
    printedFor.current = pages;
    // printPages reads refs only, so it is stable and needs no dep.
    void printPages();
  }, [autoPrint, open, pages, error, readyFrame]);

  const print = () => {
    const frame = document.getElementById("pdf-preview-frame") as HTMLIFrameElement | null;
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  };

  // One image per sheet, sized to fit inside the sheet. A full-width image
  // could be a hair taller than the printable area (paper size, rounding),
  // spilling onto an extra blank sheet; and a break after the last page added
  // another. Each page is boxed to the sheet height and only breaks between.
  const printableDoc = (pages ?? [])
    .map(
      (src, i, all) =>
        `<div class="pg"${i < all.length - 1 ? ' style="break-after:page;page-break-after:always"' : ""}><img src="${src}" /></div>`,
    )
    .join("");

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {notice && !error && (
          <p className="text-xs text-amber-700 dark:text-amber-500 bg-amber-500/10 rounded-md px-3 py-2">
            {notice}
          </p>
        )}

        <div
          className="bg-muted/40 rounded-lg overflow-hidden flex items-center justify-center"
          style={{ minHeight: 400 }}
        >
          {error ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              {onRetry && (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  Try again
                </Button>
              )}
            </div>
          ) : pages && pages.length > 0 ? (
            <div className="w-full h-[70vh] overflow-auto bg-muted/40 p-3 space-y-3">
              {pages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`${title} — page ${i + 1}`}
                  className="w-full shadow-sm bg-white"
                />
              ))}
              <iframe
                ref={printFrame}
                onLoad={(event) => {
                  // srcDoc mounts asynchronously: only this event certifies
                  // that we are looking at the prescription, not about:blank.
                  const document = event.currentTarget.contentDocument;
                  if (!document || document.images.length !== pages.length) return;
                  if (Array.from(document.images).some((img) => !img.complete || img.naturalWidth === 0)) return;
                  setReadyFrame({ pages, document });
                }}
                title="print"
                aria-hidden="true"
                tabIndex={-1}
                className="hidden"
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html,body{margin:0;padding:0}.pg{height:99vh;overflow:hidden;display:flex;align-items:flex-start;justify-content:center;break-inside:avoid;page-break-inside:avoid}.pg img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}</style></head><body>${printableDoc}</body></html>`}
              />
            </div>
          ) : html ? (
            // srcdoc, not a written-to window: the document travels with the
            // frame rather than being navigated to.
            <iframe id="pdf-preview-frame" srcDoc={html} title={title} className="w-full h-[70vh] bg-white" />
          ) : url ? (
            // <object> rather than <iframe> so that a browser which will not
            // display a PDF in place renders the children instead of a
            // broken-document icon.
            <object id="pdf-preview-frame" data={url} type="application/pdf" className="w-full h-[70vh]">
              <div className="p-8 text-center space-y-3">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  This browser will not display the document inside the app. It is ready — open it in
                  a tab or download it.
                </p>
              </div>
            </object>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {preparing}
            </div>
          )}
        </div>

        {((pages && pages.length > 0) || url || html) && !error && (
          <div className="flex justify-end gap-2">
            {pages && pages.length > 0 ? (
              <Button type="button" variant="outline" size="sm" disabled={!pagesReady} onClick={() => void printPages()}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            ) : html ? (
              <Button type="button" variant="outline" size="sm" onClick={print}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
              >
                Open in new tab
              </Button>
            )}
            {onDownload && (
              <Button type="button" variant="outline" size="sm" onClick={onDownload} disabled={downloading}>
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
