import { supabase } from "@/integrations/supabase/client";

export type SyncStage = "linking" | "clinical" | "pictures" | "attachments";

export interface StageTotals {
  processed: number;
  imported: number;
  skipped: number;
  errors: number;
}

interface SyncState {
  running: boolean;
  stage: SyncStage | null;
  message: string;
  log: string[];
  totals: Record<SyncStage, StageTotals>;
  error: string | null;
}

function initialTotals(): Record<SyncStage, StageTotals> {
  return {
    linking: { processed: 0, imported: 0, skipped: 0, errors: 0 },
    clinical: { processed: 0, imported: 0, skipped: 0, errors: 0 },
    pictures: { processed: 0, imported: 0, skipped: 0, errors: 0 },
    attachments: { processed: 0, imported: 0, skipped: 0, errors: 0 },
  };
}

let state: SyncState = {
  running: false,
  stage: null,
  message: "",
  log: [],
  totals: initialTotals(),
  error: null,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeSync(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSyncState() {
  return state;
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  emit();
}

function pushLog(msg: string) {
  state = { ...state, log: [...state.log.slice(-49), msg] };
  emit();
}

function addTotals(stage: SyncStage, delta: Partial<StageTotals>) {
  const current = state.totals[stage];
  state = {
    ...state,
    totals: {
      ...state.totals,
      [stage]: {
        processed: current.processed + (delta.processed ?? 0),
        imported: current.imported + (delta.imported ?? 0),
        skipped: current.skipped + (delta.skipped ?? 0),
        errors: current.errors + (delta.errors ?? 0),
      },
    },
  };
  emit();
}

let stopRequested = false;

export function stopSync() {
  if (!state.running) return;
  stopRequested = true;
  pushLog("Stopping after the current batch…");
}

async function invoke(nameWithQuery: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke(nameWithQuery);
  if (error) throw new Error(`${nameWithQuery.split("?")[0]}: ${error.message}`);
  if (!data?.ok) throw new Error(`${nameWithQuery.split("?")[0]}: ${data?.error || "request failed"}`);
  return data;
}

// A single failed batch (a network blip, a Salesforce rate-limit response)
// used to abort the entire multi-hour sync, forcing a manual restart from
// wherever it happened to stop. Retry a few times with backoff first - the
// batch is idempotent (per-patient sf_..._synced_at markers), so a retry
// just repeats the same bounded work.
async function invokeWithRetry(nameWithQuery: string, attempts = 4): Promise<any> {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    if (stopRequested) throw lastErr || new Error("stopped");
    try {
      return await invoke(nameWithQuery);
    } catch (e) {
      lastErr = e as Error;
      if (i < attempts - 1) {
        pushLog(`Retrying after error: ${lastErr.message}`);
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

// The per-patient-marker functions always return a numeric `processed`
// count. If it's missing, the deployed function predates that change (an
// old build still running offset/has_more logic) - fail loudly instead of
// silently reading `undefined` as "nothing pending" and stopping after one
// wasted, effectively no-op call.
function assertProcessedShape(fnName: string, data: any) {
  if (typeof data.processed !== "number") {
    throw new Error(
      `${fnName} returned an unexpected response shape (no "processed" field) - the deployed function is likely out of date and needs to be redeployed from the current repo code.`,
    );
  }
}

async function loopLinking() {
  let offset = 0;
  for (;;) {
    if (stopRequested) return;
    const data = await invokeWithRetry(`sf-match-phones?apply=true&apply_offset=${offset}&apply_limit=2000`);
    addTotals("linking", { processed: data.updated ?? 0, imported: data.updated ?? 0 });
    pushLog(`Linking: matched ${data.updated ?? 0} patient(s) by phone number`);
    if (data.next_apply_offset === null || data.next_apply_offset === undefined) return;
    offset = data.next_apply_offset;
  }
}

// A batch only makes progress when at least one patient completes without
// errors - those are the ones that get their sf_*_synced_at marker set and
// therefore drop out of the next batch. A patient that keeps failing comes
// back in the identical batch forever, so we bail out after a few
// consecutive no-progress rounds instead of looping endlessly.
const MAX_STALLED_ROUNDS = 3;

function countSucceeded(results: any[]) {
  return results.filter((r) => !r?.error && !(r?.errors?.length)).length;
}

function stalledError(stage: string, results: any[]) {
  const sample = results
    .map((r) => r?.error || r?.errors?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("; ");
  return new Error(
    `${stage} stopped making progress - the same patient(s) keep failing after ${MAX_STALLED_ROUNDS} attempts${sample ? `: ${sample}` : ""}`,
  );
}

async function loopClinical() {
  let stalled = 0;
  for (;;) {
    if (stopRequested) return;
    const data = await invokeWithRetry("sf-import-clinical?limit=20");
    assertProcessedShape("sf-import-clinical", data);
    const results: any[] = data.results || [];
    const imported = results.reduce((s, r) => s + (r.appointments || 0) + (r.invoices || 0) + (r.procedures || 0), 0);
    const skipped = results.reduce((s, r) => s + (r.skipped || 0), 0);
    const errors = results.reduce((s, r) => s + (r.errors?.length || 0), 0);
    addTotals("clinical", { processed: data.processed ?? 0, imported, skipped, errors });
    pushLog(`Clinical: processed ${data.processed ?? 0} patient(s), ${imported} record(s) imported`);
    if (!data.processed) return;
    stalled = countSucceeded(results) > 0 ? 0 : stalled + 1;
    if (stalled >= MAX_STALLED_ROUNDS) throw stalledError("Clinical sync", results);
  }
}

async function loopPictures() {
  let stalled = 0;
  for (;;) {
    if (stopRequested) return;
    const data = await invokeWithRetry("sf-import-pictures?limit=150");
    assertProcessedShape("sf-import-pictures", data);
    const results: any[] = data.results || [];
    const imported = results.reduce((s, r) => s + (r.imported || 0), 0);
    const skipped = results.reduce((s, r) => s + (r.skipped || 0), 0);
    addTotals("pictures", { processed: data.processed ?? 0, imported, skipped, errors: data.error_count || 0 });
    pushLog(`Photos: processed ${data.processed ?? 0} patient(s), ${imported} photo(s) imported`);
    if (!data.processed) return;
    stalled = countSucceeded(results) > 0 ? 0 : stalled + 1;
    if (stalled >= MAX_STALLED_ROUNDS) throw stalledError("Photo sync", results);
  }
}

async function loopAttachments() {
  let stalled = 0;
  for (;;) {
    if (stopRequested) return;
    const data = await invokeWithRetry("sf-import-attachments?limit=150");
    assertProcessedShape("sf-import-attachments", data);
    const results: any[] = data.results || [];
    const imported = results.reduce((s, r) => s + (r.imported || 0), 0);
    const skipped = results.reduce((s, r) => s + (r.skipped || 0), 0);
    addTotals("attachments", { processed: data.processed ?? 0, imported, skipped, errors: data.error_count || 0 });
    pushLog(`Attachments: processed ${data.processed ?? 0} patient(s), ${imported} file(s) imported`);
    if (!data.processed) return;
    stalled = countSucceeded(results) > 0 ? 0 : stalled + 1;
    if (stalled >= MAX_STALLED_ROUNDS) throw stalledError("Attachment sync", results);
  }
}

// Date-window sync: pulls every Salesforce appointment (plus its billing and
// procedure records) created for a given day/range, regardless of whether the
// patient was already marked as backfilled. Patients that exist only in
// Salesforce are created on the fly so their appointments aren't dropped.
export async function startRecentSync(from: Date, to: Date) {
  if (state.running) return;
  stopRequested = false;
  setState({ running: true, error: null, log: [], totals: initialTotals(), message: "Starting…", stage: "clinical" });
  try {
    let offset = 0;
    let created = 0;
    let updatedTotal = 0;
    let cancelledTotal = 0;
    for (;;) {
      if (stopRequested) { setState({ running: false, stage: null, message: "Stopped." }); return; }
      const qs = `mode=recent&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=20&offset=${offset}`;
      const data = await invokeWithRetry(`sf-import-clinical?${qs}`);
      assertProcessedShape("sf-import-clinical", data);
      const results: any[] = data.results || [];
      const imported = results.reduce((s, r) => s + (r.appointments || 0) + (r.invoices || 0) + (r.procedures || 0), 0);
      const updated = results.reduce((s, r) => s + (r.updated || 0), 0);
      const skipped = results.reduce((s, r) => s + (r.skipped || 0), 0);
      const errors = results.reduce((s, r) => s + (r.errors?.length || 0), 0);
      created += data.recent_created_patients || 0;
      updatedTotal += updated;
      cancelledTotal += data.recent_cancelled_missing || 0;
      addTotals("clinical", { processed: data.processed ?? 0, imported, skipped, errors });
      pushLog(`Date range: ${data.processed ?? 0} patient(s) of ${data.recent_total_patients ?? 0}, ${imported} imported, ${updated} updated`);
      if (data.next_offset === null || data.next_offset === undefined) break;
      offset = data.next_offset;
    }
    if (created > 0) pushLog(`${created} new patient(s) created from Salesforce.`);
    if (updatedTotal > 0) pushLog(`${updatedTotal} existing appointment(s) refreshed from Salesforce.`);
    if (cancelledTotal > 0) pushLog(`${cancelledTotal} appointment(s) cancelled (removed in Salesforce).`);

    setState({ running: false, stage: null, message: "Sync complete." });
  } catch (e: any) {
    setState({ running: false, stage: null, error: e.message, message: `Failed: ${e.message}` });
    pushLog(`Error: ${e.message}`);
  }
}

export async function startSync() {

  if (state.running) return;
  stopRequested = false;
  setState({ running: true, error: null, log: [], totals: initialTotals(), message: "Starting…" });
  try {
    setState({ stage: "linking", message: "Linking patients to Salesforce by phone number…" });
    await loopLinking();
    if (stopRequested) { setState({ running: false, stage: null, message: "Stopped." }); return; }

    setState({ stage: "clinical", message: "Syncing appointments, procedures & invoices…" });
    await loopClinical();
    if (stopRequested) { setState({ running: false, stage: null, message: "Stopped." }); return; }

    setState({ stage: "pictures", message: "Syncing before/after photos…" });
    await loopPictures();
    if (stopRequested) { setState({ running: false, stage: null, message: "Stopped." }); return; }

    setState({ stage: "attachments", message: "Syncing documents & attachments…" });
    await loopAttachments();

    setState({ running: false, stage: null, message: "Sync complete." });
    pushLog("All stages complete.");
  } catch (e: any) {
    setState({ running: false, stage: null, error: e.message, message: `Failed: ${e.message}` });
    pushLog(`Error: ${e.message}`);
  }
}
