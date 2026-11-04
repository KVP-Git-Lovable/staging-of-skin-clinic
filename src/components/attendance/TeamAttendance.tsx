import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { MapPin, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hoursWorked, type AttendanceRecord } from "@/lib/attendance";
import { formatFix, mapsLink, type Fix } from "@/lib/geo";
import { nonWorkingReason } from "@/lib/workingDays";
import { useAttendanceSettings } from "@/hooks/useAttendanceSettings";
import { FaceBadge } from "@/pages/Attendance";

/**
 * Everyone's attendance, with the photos.
 *
 * A SECTION of the attendance page, not a page. It used to be its own screen
 * at /admin/attendance, and the clinic kept opening it looking for check-in
 * and finding only a date filter and an empty list. One page called
 * Attendance now carries your own day at the top and this underneath, for
 * admins only.
 *
 * The timestamp is burned into each picture at capture, so a photo that
 * leaves this screen still carries when it was taken. It is also printed
 * beside it, because reading it off the image is fine for checking one and
 * useless for scanning fifty.
 *
 * Phase 2 will add regularisation, attendance configuration and the
 * employee-facing leave requests as tabs here. Leave itself already lives at
 * /leave and is untouched.
 */
export function TeamAttendance() {
  const { weekOffs, holidays } = useAttendanceSettings();
  const [from, setFrom] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [photo, setPhoto] = useState<{ url: string; who: string; when: string } | null>(null);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["attendance", "admin", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*, staff(first_name, last_name, role)")
        .gte("date", from).lte("date", to)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as (AttendanceRecord & { staff: unknown })[];
    },
  });

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold font-display flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />All staff
      </h2>

      {/* Share the row rather than two fixed 160px boxes: at 375px those
          came to 332px against ~343px of usable width, and iOS renders a
          date input wider than that again. */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-0 flex-1 sm:flex-none">
          <Label htmlFor="from" className="text-xs">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full sm:w-40" />
        </div>
        <div className="min-w-0 flex-1 sm:flex-none">
          <Label htmlFor="to" className="text-xs">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full sm:w-40" />
        </div>
      </div>

      {error ? (
        <p className="text-destructive py-10 text-center">{error.message}</p>
      ) : isLoading ? (
        <p className="py-10 text-center text-muted-foreground">Loading attendance…</p>
      ) : !rows.length ? (
        <div className="py-16 border-y text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-3" />
          <p>No attendance recorded in this period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const staff = r.staff as { first_name?: string; last_name?: string; role?: string } | null;
            const who = `${staff?.first_name ?? ""} ${staff?.last_name ?? ""}`.trim() || "Unknown";
            const hours = hoursWorked(r.check_in_time, r.check_out_time);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{who} <span className="text-muted-foreground font-normal text-sm">· {staff?.role}</span></p>
                    <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                      {format(new Date(r.date), "EEE, d MMM yyyy")}
                      {/* Why the clinic was shut that day - a record on a
                          holiday is worth seeing as such, not as an oddity. */}
                      {nonWorkingReason(new Date(r.date), weekOffs, holidays) && (
                        <Badge variant="outline" className="text-[11px]">
                          {nonWorkingReason(new Date(r.date), weekOffs, holidays)}
                        </Badge>
                      )}
                    </p>
                    <Where
                      inAddress={r.check_in_address}
                      inFix={r.check_in_location as Fix | null}
                      outAddress={r.check_out_address}
                      outFix={r.check_out_location as Fix | null}
                    />
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm pt-1">
                      <Stamp label="Started" time={r.check_in_time} status={r.check_in_face_status} confidence={r.check_in_face_confidence} />
                      <Stamp label="Ended" time={r.check_out_time} status={r.check_out_face_status} confidence={r.check_out_face_confidence} />
                      {hours !== null && <div><p className="text-xs text-muted-foreground">Hours</p><p className="font-medium">{hours}</p></div>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Thumb url={r.check_in_photo} label="In" who={who} when={r.check_in_time} onOpen={setPhoto} />
                    <Thumb url={r.check_out_photo} label="Out" who={who} when={r.check_out_time} onOpen={setPhoto} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!photo} onOpenChange={(open) => { if (!open) setPhoto(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{photo?.who} · {photo?.when}</DialogTitle></DialogHeader>
          {/* max-h + object-contain, so the WHOLE photo is on screen at once.
              A portrait selfie at w-full rendered ~343x610 on a phone inside
              a max-h-[92dvh] scrolling dialog, which put the bottom of the
              image below the fold - and the bottom of the image is exactly
              where stampPhoto draws the time and place. An admin checking a
              disputed check-in saw a face and no caption. */}
          {photo && (
            <img
              src={photo.url}
              alt={`${photo.who} at ${photo.when}`}
              className="max-h-[70dvh] w-full rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * Where they were, in words where we have them.
 *
 * The caption is already burned into the photo; this is the same thing
 * readable without opening it, and scannable down a list of fifty.
 */
function Where({ inAddress, inFix, outAddress, outFix }: {
  inAddress: string | null; inFix: Fix | null;
  outAddress: string | null; outFix: Fix | null;
}) {
  const start = inAddress || formatFix(inFix);
  const end = outAddress || formatFix(outFix);
  // Usually identical - one clinic, one door - so say it once.
  const same = start && end && start === end;
  const link = mapsLink(inFix) || mapsLink(outFix);
  if (!start && !end) return null;
  return (
    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span className="min-w-0">
        {same ? start : [start && `In: ${start}`, end && `Out: ${end}`].filter(Boolean).join(" · ")}
        {link && (
          <>
            {" "}
            <a href={link} target="_blank" rel="noopener noreferrer" className="underline text-primary whitespace-nowrap">
              Open in Maps
            </a>
          </>
        )}
      </span>
    </p>
  );
}

function Stamp({ label, time, status, confidence }: { label: string; time: string | null; status: string | null; confidence: number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{time ? format(new Date(time), "h:mm:ss a") : "—"}</p>
      {status && (
        <div className="flex items-center gap-1">
          <FaceBadge status={status} />
          {/* The number matters when somebody disputes a check: a 74% refusal
              and a 12% refusal are very different conversations. */}
          {status !== "bypassed" && confidence != null && (
            <span className="text-[11px] text-muted-foreground">{confidence}%</span>
          )}
        </div>
      )}
    </div>
  );
}

function Thumb({ url, label, who, when, onOpen }: {
  url: string | null; label: string; who: string; when: string | null;
  onOpen: (p: { url: string; who: string; when: string }) => void;
}) {
  if (!url) {
    return <div className="h-20 w-20 rounded-md border border-dashed flex items-center justify-center text-[11px] text-muted-foreground">{label}</div>;
  }
  const whenText = when ? format(new Date(when), "d MMM yyyy, h:mm:ss a") : "—";
  return (
    <button
      type="button"
      className="h-20 w-20 overflow-hidden rounded-md border transition hover:ring-2 hover:ring-primary"
      title={`${label} · ${whenText}`}
      onClick={() => onOpen({ url, who, when: whenText })}
    >
      <img src={url} alt={`${who} ${label}`} loading="lazy" className="h-full w-full object-cover" />
    </button>
  );
}
