import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { renderPdfToImages } from "@/lib/renderPdf";

/**
 * Reading a prescription, from wherever it is listed.
 *
 * Extracted from ProcedureDetailSheet, which had the only copy. A prescription
 * is listed in three places - the patient's Prescriptions tab, an appointment's
 * Previous Prescriptions, and the procedure itself - and in the first two the
 * only way to read one was to open the whole visit and find the button inside
 * it. Opening a visit to read it also means being one slip away from editing
 * it, which is how a saved prescription has twice come back changed.
 *
 * The preview is drawn in the page rather than handed to the browser: showing
 * a PDF any other way means loading a document, which is the thing the
 * clinic's machines refuse. "Open in new tab" stays inside the dialog, where
 * clicking it is a fresh gesture and so is never blocked.
 */

/** The builder answers in a couple of seconds. */
const PDF_TIMEOUT_MS = 45000;

export function usePrescriptionPreview(procedureId?: string | null) {
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState("Prescription.pdf");
  const bytes = useRef<ArrayBuffer | null>(null);

  const fetchPdf = async () => {
    if (!procedureId) return null;
    const { data, error: fnError } = await supabase.functions.invoke("generate-prescription-pdf", {
      body: { procedureId },
      // The bound belongs on the request itself, not on a race beside it:
      // functions-js turns `timeout` into an AbortController, so the request is
      // actually cancelled. A setTimeout racing outside it leaves the real
      // request running, and is itself throttled once the tab goes background.
      timeout: PDF_TIMEOUT_MS,
    });
    // supabase-js flattens every non-2xx to "Edge Function returned a non-2xx
    // status code" and drops the body. Recover what the function actually
    // said, so a failure names itself instead of needing to be guessed at.
    if (fnError) {
      throw new Error(
        await edgeFunctionErrorMessage(
          fnError,
          "The prescription could not be prepared. Please try again.",
        ),
      );
    }
    if (!data?.base64) throw new Error("No PDF returned");
    const bin = atob(data.base64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return { bytes: buf.buffer, filename: data.filename || "Prescription.pdf" };
  };

  const save = (data: ArrayBuffer, name: string) => {
    const objUrl = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
    const a = document.createElement("a");
    // <a download> saves rather than navigates, and navigating is what the
    // clinic's extension blocks. This path worked throughout.
    a.href = objUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  };

  const preview = async () => {
    setPreviewing(true);
    setError(null);
    setPages(null);
    bytes.current = null;
    setOpen(true);
    try {
      const pdf = await fetchPdf();
      if (!pdf) {
        setOpen(false);
        return;
      }
      bytes.current = pdf.bytes;
      setFilename(pdf.filename);
      setPages(await renderPdfToImages(pdf.bytes));
    } catch (e: any) {
      const message = e?.message || "Failed to generate prescription";
      // Stated where the doctor is looking, not only in a toast that fades.
      setError(message);
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  };

  const download = async () => {
    // Already fetched to draw the preview - no need to build it twice.
    if (bytes.current) {
      save(bytes.current, filename);
      toast.success("Prescription downloaded");
      return;
    }
    setDownloading(true);
    try {
      const pdf = await fetchPdf();
      if (!pdf) return;
      save(pdf.bytes, pdf.filename);
      toast.success("Prescription downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate prescription");
    } finally {
      setDownloading(false);
    }
  };

  const close = () => {
    setOpen(false);
    setPages(null);
    bytes.current = null;
    setError(null);
  };

  return { open, pages, error, previewing, downloading, preview, download, close };
}
