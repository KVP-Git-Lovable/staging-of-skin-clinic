import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ImageIcon, Loader2, Play, Pause, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hashImageUrl, thumbnailUrl } from "@/lib/photoHashImage";
import { toast } from "sonner";

/**
 * Giving the clinic's existing photographs their fingerprints.
 *
 * Photos uploaded from now on are fingerprinted as they arrive, but there are
 * 87,879 already in the bucket going back to 2022, and Photos search can only
 * find a picture that has one. This works through them.
 *
 * Newest first, deliberately: a photo somebody is trying to place today is far
 * more likely to be recent, so the search becomes useful long before the 2022
 * archive is finished. Nothing is ever deleted or overwritten here - the only
 * column written is phash, and only where it was empty.
 *
 * Stop and start whenever. Progress is the database's own state (a photo
 * either has a fingerprint or does not), so closing the tab loses nothing and
 * resuming picks up exactly where it stopped.
 */

/** Rows claimed from the database per round. */
const BATCH_SIZE = 60;
/** Images fetched at once. Enough to be quick, few enough to stay polite. */
const CONCURRENCY = 6;

type PhotoRow = { id: string; photo_url: string | null };
type Fetched = "unknown" | "thumbnail" | "original";

/** Run a job over a list, a few at a time, keeping results in order. */
async function mapLimit<T, R>(items: T[], limit: number, job: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await job(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export default function PhotoFingerprints() {
  const [total, setTotal] = useState<number | null>(null);
  const [hashed, setHashed] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const [running, setRunning] = useState(false);
  const [fetched, setFetched] = useState<Fetched>("unknown");
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [note, setNote] = useState("");

  // A ref, not state: the loop below reads it on every round and must see a
  // pause the instant it happens, not on the next render.
  const keepGoing = useRef(false);

  const refreshCounts = useCallback(async () => {
    setCounting(true);
    try {
      const all = await supabase.from("patient_photos").select("id", { count: "exact", head: true });
      const withHash = await supabase
        .from("patient_photos")
        .select("id", { count: "exact", head: true })
        .not("phash", "is", null);
      setTotal(all.count ?? null);
      setHashed(withHash.count ?? null);
    } finally {
      setCounting(false);
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
    return () => { keepGoing.current = false; };
  }, [refreshCounts]);

  /**
   * Whether this project can serve a small rendering of a photo.
   *
   * It decides whether the whole job moves a few kilobytes per photo or a
   * megabyte per photo, which is the difference between minutes and hours.
   * Supabase image transformation is a paid feature, so it may simply not
   * answer - in which case the originals are used and it still works.
   */
  const detectFetchMode = async (sample: string): Promise<Fetched> => {
    const thumb = thumbnailUrl(sample);
    if (!thumb) return "original";
    try {
      const res = await fetch(thumb);
      const type = res.headers.get("content-type") || "";
      return res.ok && type.startsWith("image/") ? "thumbnail" : "original";
    } catch {
      return "original";
    }
  };

  const hashOne = async (row: PhotoRow, mode: Fetched): Promise<{ id: string; phash: string } | null> => {
    if (!row.photo_url) return null;
    const small = mode === "thumbnail" ? thumbnailUrl(row.photo_url) : null;
    // Falls back to the original for a photo the renderer cannot handle, so one
    // awkward file does not get skipped just because the thumbnail failed.
    const hash = (small && (await hashImageUrl(small))) || (await hashImageUrl(row.photo_url));
    return hash ? { id: row.id, phash: hash } : null;
  };

  const start = async () => {
    keepGoing.current = true;
    setRunning(true);
    setNote("");

    try {
      // Photos that could not be read stay unhashed, so they would be handed
      // back forever. The window is moved past them by however many failed.
      let offset = 0;
      let mode = fetched;

      while (keepGoing.current) {
        const { data, error } = await supabase
          .from("patient_photos")
          .select("id, photo_url")
          .is("phash", null)
          .order("taken_at", { ascending: false })
          .range(offset, offset + BATCH_SIZE - 1);
        if (error) throw error;

        const rows = (data || []) as PhotoRow[];
        if (rows.length === 0) {
          setNote("Every photo has a fingerprint. Photos search covers the whole archive.");
          break;
        }

        if (mode === "unknown") {
          const sample = rows.find((r) => r.photo_url)?.photo_url;
          mode = sample ? await detectFetchMode(sample) : "original";
          setFetched(mode);
        }

        const results = await mapLimit(rows, CONCURRENCY, (r) => hashOne(r, mode));
        if (!keepGoing.current) break;

        const ok = results.filter(Boolean) as { id: string; phash: string }[];
        if (ok.length > 0) {
          const { error: writeError } = await supabase.rpc("set_patient_photo_hashes", { _rows: ok });
          if (writeError) throw writeError;
        }

        setDone((d) => d + ok.length);
        setFailed((f) => f + (rows.length - ok.length));
        setHashed((h) => (h === null ? h : h + ok.length));
        offset += rows.length - ok.length;

        // A whole batch failing is not a run of bad files - it is the network,
        // or permissions. Stop rather than spin through 87,879 of them.
        if (ok.length === 0) {
          setNote("Nothing in the last batch could be read. Stopped - check the connection and try again.");
          break;
        }
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The run stopped unexpectedly.");
      toast.error("Fingerprinting stopped");
    } finally {
      keepGoing.current = false;
      setRunning(false);
      void refreshCounts();
    }
  };

  const pause = () => {
    keepGoing.current = false;
    setNote("Paused. Starting again picks up where it stopped.");
  };

  const remaining = total !== null && hashed !== null ? Math.max(0, total - hashed) : null;
  const percent = total && hashed !== null && total > 0 ? Math.round((hashed / total) * 100) : 0;
  // Rough, and said to be rough: a thumbnail is a few KB, an original about a MB.
  const estimate =
    remaining === null
      ? null
      : fetched === "original"
        ? `about ${Math.round((remaining * 1) / 1024)} GB to download`
        : `about ${Math.round((remaining * 15) / 1024)} MB to download`;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Photo fingerprints</h1>
        <p className="text-sm text-muted-foreground">
          Lets Photos search find a patient from a copy of a photograph already on their record.
          New photos are fingerprinted as they are uploaded; this covers the ones already here.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          {counting && total === null ? (
            <span className="text-muted-foreground">Counting photos…</span>
          ) : (
            <span>
              <strong>{(hashed ?? 0).toLocaleString()}</strong> of{" "}
              <strong>{(total ?? 0).toLocaleString()}</strong> photos fingerprinted
              {remaining ? <span className="text-muted-foreground"> · {remaining.toLocaleString()} to go</span> : null}
            </span>
          )}
        </div>

        <Progress value={percent} />

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button onClick={pause} variant="secondary">
              <Pause className="h-4 w-4 mr-1.5" /> Pause
            </Button>
          ) : (
            <Button onClick={start} disabled={remaining === 0}>
              <Play className="h-4 w-4 mr-1.5" /> {done > 0 ? "Continue" : "Start"}
            </Button>
          )}
          <Button onClick={() => void refreshCounts()} variant="ghost" size="sm" disabled={running || counting}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${counting ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {running && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {done.toLocaleString()} done this run
              {failed > 0 ? ` · ${failed.toLocaleString()} unreadable` : ""}
            </span>
          )}
        </div>

        {note && <p className="text-xs text-muted-foreground">{note}</p>}

        <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
          <p>
            Newest photos first, so searching becomes useful long before the oldest are done.
            Safe to stop and start — nothing is lost, and nothing on a photo is changed except
            adding its fingerprint.
          </p>
          {fetched !== "unknown" && estimate && (
            <p>
              {fetched === "thumbnail"
                ? `Using small renderings of each photo — ${estimate}.`
                : `Small renderings are not available on this project, so full photos are being used — ${estimate}. Leave this tab open.`}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
