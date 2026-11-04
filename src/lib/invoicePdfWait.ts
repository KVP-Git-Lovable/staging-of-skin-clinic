/**
 * Waiting for an invoice PDF that arrives after the request gave up.
 *
 * Generating the clinic's invoice usually takes under a minute, but not always:
 * on Saturday 3 October one bill's PDF landed 82 minutes after the bill was
 * raised, another 34, another 20. The screen made one call, and the moment it
 * failed it showed the plain printable copy instead - which is the clinic's
 * fallback template, not their invoice. They print the second the money is
 * taken, which is exactly when the generator is busiest.
 *
 * The function usually finishes anyway. So when the call gives up, this waits a
 * little longer and looks for the document it wrote.
 *
 * It accepts one only when the invoice row was written **after we asked**.
 * That is what keeps it this print's document: the screen regenerates rather
 * than reusing whatever is stored precisely because an older PDF can predate an
 * edit and show an amount the bill no longer says.
 */

export interface InvoicePdfRow {
  pdf_url?: string | null;
  updated_at?: string | null;
}

export interface WaitForInvoicePdfOptions {
  /** Reads the invoice's pdf_url and updated_at. */
  read: () => Promise<InvoicePdfRow | null>;
  /** Everything written before this is older than the request. */
  askedAt: Date;
  /** Give up after this long. */
  timeoutMs?: number;
  /** How often to look. */
  intervalMs?: number;
  /** Injected so the tests do not spend real seconds. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** True when this row carries a PDF written after the request. */
export function isFreshPdf(row: InvoicePdfRow | null | undefined, askedAt: Date): boolean {
  if (!row?.pdf_url) return false;
  const written = row.updated_at ? new Date(row.updated_at).getTime() : NaN;
  if (Number.isNaN(written)) return false;
  return written >= askedAt.getTime();
}

/** The PDF's url once it appears, or null if it does not in time. */
export async function waitForInvoicePdf({
  read,
  askedAt,
  timeoutMs = 30_000,
  intervalMs = 3_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}: WaitForInvoicePdfOptions): Promise<string | null> {
  const deadline = now() + timeoutMs;
  for (;;) {
    let row: InvoicePdfRow | null = null;
    try {
      row = await read();
    } catch {
      // A failed read is not an answer; keep waiting until the deadline.
      row = null;
    }
    if (isFreshPdf(row, askedAt)) return row!.pdf_url!;
    if (now() >= deadline) return null;
    await sleep(intervalMs);
  }
}
