import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TimePicker12h } from "@/components/shared/TimePicker12h";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Journey } from "@/lib/comms/journeys";
import {
  computeNextRun,
  formatIst,
  summarizeSchedule,
  WEEKDAY_SHORT,
  type JourneySchedule,
  type ScheduleFrequency,
  type ScheduleType,
} from "@/lib/comms/schedule";

const blank = (): JourneySchedule => ({
  type: "one_time",
  frequency: null,
  execution_date: null,
  execution_time: "10:00",
  days_of_week: null,
  day_of_month: null,
  month_of_quarter: null,
});

function validate(s: JourneySchedule): string | null {
  if (!s.execution_time) return "Pick a run time";
  if (s.type === "one_time") return s.execution_date ? null : "Pick a date";
  if (!s.frequency) return "Pick a frequency";
  if (s.frequency === "weekly" && !(s.days_of_week && s.days_of_week.length)) return "Pick at least one weekday";
  if ((s.frequency === "monthly" || s.frequency === "quarterly") && !s.day_of_month) return "Pick a day of the month";
  if (s.frequency === "quarterly" && !s.month_of_quarter) return "Pick the month within the quarter";
  return null;
}

export function JourneyScheduleDialog({
  journey,
  onOpenChange,
}: {
  journey: Journey | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [s, setS] = useState<JourneySchedule>(blank());

  useEffect(() => {
    if (journey) setS(journey.schedule ? { ...journey.schedule, execution_time: (journey.schedule.execution_time || "10:00").slice(0, 5) } : blank());
  }, [journey]);

  const locked = journey?.status === "active" || journey?.approval_status === "pending";
  const error = validate(s);
  const next = !error ? computeNextRun(s) : null;
  const patch = (p: Partial<JourneySchedule>) => setS((prev) => ({ ...prev, ...p }));

  const done = (message: string) => {
    toast.success(message);
    qc.invalidateQueries({ queryKey: ["comms-journeys"] });
    qc.invalidateQueries({ queryKey: ["comms-journey", journey?.id] });
    onOpenChange(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        journey_id: journey!.id,
        type: s.type,
        frequency: s.type === "recurring" ? s.frequency : null,
        execution_date: s.type === "one_time" ? s.execution_date : null,
        execution_time: s.execution_time,
        days_of_week: s.type === "recurring" && s.frequency === "weekly" ? s.days_of_week : null,
        day_of_month: s.type === "recurring" && (s.frequency === "monthly" || s.frequency === "quarterly") ? s.day_of_month : null,
        month_of_quarter: s.type === "recurring" && s.frequency === "quarterly" ? s.month_of_quarter : null,
        next_run_at: next ? next.toISOString() : null,
      };
      const { error } = await supabase.from("comms_journey_schedules").upsert(row as never, { onConflict: "journey_id" });
      if (error) throw error;
    },
    onSuccess: () => done("Schedule saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("comms_journey_schedules").delete().eq("journey_id", journey!.id);
      if (error) throw error;
    },
    onSuccess: () => done("Schedule removed"),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDay = (d: number) => {
    const days = new Set(s.days_of_week ?? []);
    if (days.has(d)) days.delete(d);
    else days.add(d);
    patch({ days_of_week: Array.from(days).sort() });
  };

  return (
    <Dialog open={!!journey} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule</DialogTitle>
          <DialogDescription>
            Without a schedule the journey starts as soon as it is activated. All times are IST.
          </DialogDescription>
        </DialogHeader>

        {locked ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            The schedule cannot be changed while the journey is {journey?.status === "active" ? "active — pause it first" : "awaiting approval"}.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={s.type} onValueChange={(v) => patch({ type: v as ScheduleType, frequency: v === "recurring" ? s.frequency ?? "daily" : null })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One time</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {s.type === "one_time" ? (
              <div>
                <Label>Date</Label>
                <Input className="mt-1.5" type="date" value={s.execution_date ?? ""} onChange={(e) => patch({ execution_date: e.target.value || null })} />
              </div>
            ) : (
              <>
                <div>
                  <Label>Frequency</Label>
                  <Select value={s.frequency ?? "daily"} onValueChange={(v) => patch({ frequency: v as ScheduleFrequency })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {s.frequency === "weekly" && (
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_SHORT.map((label, d) => (
                      <Button key={label} type="button" size="sm" variant={s.days_of_week?.includes(d) ? "default" : "outline"} onClick={() => toggleDay(d)}>
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
                {s.frequency === "quarterly" && (
                  <div>
                    <Label>Month of the quarter</Label>
                    <Select value={String(s.month_of_quarter ?? "")} onValueChange={(v) => patch({ month_of_quarter: Number(v) })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a month" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">First (Jan / Apr / Jul / Oct)</SelectItem>
                        <SelectItem value="2">Second (Feb / May / Aug / Nov)</SelectItem>
                        <SelectItem value="3">Third (Mar / Jun / Sep / Dec)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(s.frequency === "monthly" || s.frequency === "quarterly") && (
                  <div>
                    <Label>Day of the month</Label>
                    <Input className="mt-1.5" type="number" min={1} max={31} value={s.day_of_month ?? ""} onChange={(e) => patch({ day_of_month: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                )}
              </>
            )}

            <div>
              <Label>Time (IST)</Label>
              <div className="mt-1.5">
                <TimePicker12h value={s.execution_time ?? "10:00"} onChange={(v) => patch({ execution_time: v })} />
              </div>
            </div>

            <p className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
              {error ? error : `${summarizeSchedule(s)}${next ? ` · next run ${formatIst(next)}` : ""}`}
            </p>
          </div>
        )}

        <DialogFooter>
          {journey?.schedule && !locked && (
            <Button variant="outline" className="mr-auto text-destructive" disabled={clear.isPending} onClick={() => clear.mutate()}>
              Remove schedule
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!locked && (
            <Button disabled={!!error || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
