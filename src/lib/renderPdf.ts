import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Turning a PDF into pictures, so it can be shown without the browser being
 * asked to open it.
 *
 * The clinic's browsers block the backend host for documents -
 * ERR_BLOCKED_BY_CLIENT, an extension - which kills every ordinary way of
 * showing a PDF: navigating a tab to it, an <iframe src>, an <object data>,
 * blob: and https alike. What those all have in common is handing the
 * browser a document to load. Fetching the same bytes over XHR is untouched,
 * because that is how the whole application talks to that host.
 *
 * So the bytes are fetched and drawn here instead, page by page onto a
 * canvas, and handed back as images. Nothing is loaded, so there is nothing
 * to refuse - and it is the clinic's own PDF on screen, not a lookalike
 * rebuilt from the record.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/** How sharp the rendered pages are. 2 is legible on screen and in print. */
const SCALE = 2;

// Pinned to 4.x deliberately. 6.x calls Map.prototype.getOrInsertComputed,
// which Chromium 141 does not have - it threw
// "this[#methodPromises].getOrInsertComputed is not a function" when this was
// rendered in a real browser here. The clinic's machines are not going to be
// newer than that, so 4.x is what gets shipped; 4.10.38 rendered the same
// document correctly in the same browser.

export async function renderPdfToImages(data: ArrayBuffer): Promise<string[]> {
  // pdf.js transfers the buffer to its worker, which detaches it. Anything
  // else holding these bytes - the Download button, say - would find them
  // empty, so it gets its own copy.
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot draw the document");
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push(canvas.toDataURL("image/png"));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
