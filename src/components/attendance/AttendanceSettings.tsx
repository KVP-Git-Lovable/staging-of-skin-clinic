import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAttendanceSettings } from "@/hooks/useAttendanceSettings";
import { useAuth } from "@/hooks/useAuth";
import { canViewModule } from "@/lib/staffAccess";
import { SettingRow as Row } from "@/components/attendance/SettingRow";
import { NumberField } from "@/components/shared/NumberField";
import { LeaveAllowancesCard, LeaveTypesCard } from "@/components/attendance/LeaveSettings";
import type { AttendanceConfig } from "@/lib/attendance";
import type { WeekOffRow } from "@/lib/workingDays";

/**
 * The attendance settings an admin can change.
 *
 * Every switch here does something. That is deliberate: the Bharath Builders
 * app this follows has roughly fifty-five attendance and leave settings, and
 * six of them change any behaviour - the rest write to tables nothing reads,
 * including two tables that were never wired up at all. A control panel full
 * of switches that do nothing is worse than no control panel, because
 * somebody will set one and believe it took effect.
 *
 * Settings arrive with the feature they govern rather than sitting here
 * inert. Both have now arrived: the monthly cap on corrections is enforced by
 * a trigger on insert, and leave configuration - which lived two tabs deep on
 * a page therapists use to book a day off - is on this tab underneath, gated
 * on `leave_admin` rather than on this page's own `attendance_admin`, so
 * reaching the page does not silently become the right to set leave policy.
 */
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PATTERNS = [
  { value: "none", label: "Working day" },
  { value: "all", label: "Every week" },
  { value: "1st_3rd", label: "1st & 3rd only" },
  { value: "2nd_4th", label: "2nd & 4th only" },
];

export function AttendancePolicyTab() {
  const { config, refetchConfig } = useAttendanceSettings();
  const { isAdmin, permissions } = useAuth();
  const canAdminLeave = canViewModule({ isAdmin, permissions, moduleKey: "leave_admin" });
  const [form, setForm] = useState<AttendanceConfig>(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(config); }, [config]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      // .select() matters. A row-level-security refusal on an UPDATE is not
      // an error - Postgres simply matches no rows - so without asking for the
      // changed row back, a non-admin would be told "saved" while nothing was.
      const { data, error } = await supabase
        .from("attendance_config" as never)
        .update({ ...form, updated_at: new Date().toISOString(), updated_by: auth?.user?.id ?? null } as never)
        .eq("singleton", true)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Nothing was saved. Changing attendance settings needs an Admin role.");
      await refetchConfig();
      toast.success("Attendance settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-lg">Check-in policy</CardTitle>
        <CardDescription>Applies to everyone. Each of these changes what happens at check-in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Row
          label="Require a selfie"
          hint="Off: staff check in with one tap, no camera and no face check, and the record is marked unverified."
        >
          <Switch
            className="relative after:absolute after:-inset-x-3 after:-inset-y-3 after:content-[''] sm:after:hidden"
            checked={form.require_selfie}
            onCheckedChange={(v) => setForm((f) => ({ ...f, require_selfie: v }))}
          />
        </Row>

        <Row
          label="Capture location"
          hint="Off: no location permission is asked for, and the photo caption carries the time only."
        >
          <Switch
            className="relative after:absolute after:-inset-x-3 after:-inset-y-3 after:content-[''] sm:after:hidden"
            checked={form.capture_location}
            onCheckedChange={(v) => setForm((f) => ({ ...f, capture_location: v }))}
          />
        </Row>

        <Row
          label="Face match threshold"
          hint="How sure the check must be before it counts as the same person. Applied on the server, so it cannot be relaxed from a phone. 75 is the default."
        >
          <div className="flex items-center gap-2">
            <NumberField
              min={0} max={100} emptyValue={75} className="w-24"
              data-testid="face-threshold"
              value={form.face_match_threshold}
              onChange={(v) => setForm((f) => ({ ...f, face_match_threshold: v }))}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </Row>

        <Row
          label="Attempts allowed"
          hint="How many goes somebody gets before being told to contact an admin."
        >
          <NumberField
            min={1} max={10} emptyValue={1} className="w-24"
            data-testid="face-attempts"
            value={form.face_max_attempts}
            onChange={(v) => setForm((f) => ({ ...f, face_max_attempts: v }))}
          />
        </Row>

        {/* The one regularisation setting this page was always going to
            grow. It is enforced by a trigger on insert, so lowering it here
            cannot be talked round from a phone - and 0 means no limit,
            which is what there was before. */}
        <Row
          label="Corrections allowed per month"
          hint="How many attendance corrections one person may ask for against any one month. 0 means no limit. A rejected request does not count."
        >
          <NumberField
            min={0} max={31} emptyValue={0} className="w-24"
            data-testid="regularisation-limit"
            value={form.regularisation_monthly_limit}
            onChange={(v) => setForm((f) => ({ ...f, regularisation_monthly_limit: v }))}
          />
        </Row>

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save settings
        </Button>
      </CardContent>
    </Card>

    {/* Leave lives here now, not two tabs deep on the page a therapist opens
        to book a day off. Gated on leave_admin, which only the Admin role
        carries - reaching this page is attendance_admin, and the two are not
        the same right. */}
    {canAdminLeave && (
      <>
        <LeaveTypesCard />
        <LeaveAllowancesCard />
      </>
    )}
    </div>
  );
}

export function WeekOffsTab() {
  const { weekOffs, refetchWeekOffs, weekOffsError } = useAttendanceSettings();
  const [busy, setBusy] = useState<number | null>(null);

  // No rows and no error still means the settings are not there to edit. Both
  // cases render the same warning rather than seven dropdowns reading
  // "Working day", which is what this screen showed while the table was
  // missing from the database - Sunday included, though it is seeded closed.
  const unreadable = Boolean(weekOffsError) || weekOffs.length === 0;

  const patternOf = (row: WeekOffRow | undefined) =>
    !row || !row.is_off ? "none" : row.alternate_pattern || "all";

  const change = async (day: number, value: string) => {
    setBusy(day);
    try {
      const isOff = value !== "none";
      const { data, error } = await supabase
        .from("week_off_config" as never)
        // "Working day" clears the pattern too - keeping a stale pattern on a
        // day that is not off is how a row ends up meaning two things.
        .update({ is_off: isOff, alternate_pattern: isOff ? value : null, updated_at: new Date().toISOString() } as never)
        .eq("day_of_week", day)
        // See the note in AttendancePolicyTab: an RLS refusal on UPDATE
        // changes nothing and reports nothing. Ask for the row back.
        .select("day_of_week");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Nothing was saved. Changing week offs needs an Admin role.");
      await refetchWeekOffs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-lg">Week offs</CardTitle>
        <CardDescription>
          Days the clinic is closed. Attendance is labelled, not blocked — somebody coming in on a day off can
          still record it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {unreadable && (
          <p className="text-sm rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
            These settings could not be loaded, so the days below are not the clinic's real week offs. Nothing
            you change here will be saved until that is fixed.
          </p>
        )}
        {DAYS.map((name, day) => {
          const row = weekOffs.find((w) => w.day_of_week === day);
          return (
            <div key={day} className="flex items-center justify-between gap-4">
              <Label className="text-sm">{name}</Label>
              <div className="flex items-center gap-2">
                {busy === day && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Select value={patternOf(row)} onValueChange={(v) => change(day, v)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PATTERNS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground pt-2">
          "1st &amp; 3rd" and "2nd &amp; 4th" count by date — the 1st to 7th of the month is the first, the 8th to
          14th the second, and so on. A 5th occurrence in a month is never a week off.
        </p>
      </CardContent>
    </Card>
  );
}

export function HolidaysTab() {
  const { holidays, refetchHolidays } = useAttendanceSettings();
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!date || !name.trim()) { toast.error("A date and a name are both needed"); return; }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("holidays" as never)
        .insert({ date, name: name.trim() } as never);
      if (error) throw new Error(error.code === "23505" ? "There is already a holiday on that date" : error.message);
      setDate(""); setName("");
      await refetchHolidays();
      // Settings > Holiday Calendar reads the same list.
      void qc.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the holiday");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("holidays" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refetchHolidays();
    void qc.invalidateQueries({ queryKey: ["holidays"] });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-lg">Holidays</CardTitle>
        <CardDescription>
          The same list as Settings &rsaquo; Holiday Calendar. A record falling on one is labelled with the
          holiday's name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="holiday-date" className="text-xs">Date</Label>
            <Input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <div className="flex-1 min-w-[12rem]">
            <Label htmlFor="holiday-name" className="text-xs">Name</Label>
            <Input id="holiday-name" value={name} placeholder="Diwali" onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={add} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Add
          </Button>
        </div>

        {!holidays.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            <CalendarDays className="h-6 w-6 mx-auto mb-2" />No holidays set
          </p>
        ) : (
          <div className="divide-y border-y">
            {holidays.map((h) => (
              <div key={h.id ?? h.date} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(h.date), "EEE, d MMM yyyy")}</p>
                </div>
                <Button
                  size="icon" variant="ghost" aria-label={`Remove ${h.name}`}
                  onClick={() => h.id && remove(h.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


