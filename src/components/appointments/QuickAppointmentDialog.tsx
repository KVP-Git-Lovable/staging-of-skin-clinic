import { useEffect, useState } from "react";
import { APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED } from "@/lib/whatsappNotifications";
import { DateInput } from "@/components/shared/DateInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Phone, Loader2, User as UserIcon, IdCard } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffCombobox } from "@/components/shared/StaffCombobox";
import { THERAPIST_ROLES } from "@/lib/appointmentTherapist";
import { toast } from "sonner";
import { format } from "date-fns";
import { shortPatientId } from "@/lib/utils";
import { MANUAL_APPOINTMENT_STATUSES } from "@/lib/appointmentStatus";
import { TimePicker12h } from "@/components/shared/TimePicker12h";
import { usualDoctorId, type PastVisit } from "@/lib/usualDoctor";

interface QuickAppointmentDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient: {
    id: string;
    first_name: string;
    last_name: string;
    phone?: string | null;
    gender?: string | null;
  };
}

const STATUS_OPTIONS = [...MANUAL_APPOINTMENT_STATUSES];

export function QuickAppointmentDialog({ open, onOpenChange, patient }: QuickAppointmentDialogProps) {
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [appointmentType, setAppointmentType] = useState<"Walk-in" | "Online">("Walk-in");
  const [appointmentStatus, setAppointmentStatus] = useState("Reserved");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("10:30");
  // Free text for this visit. Stored in reason_for_consultation, the column the
  // Salesforce import already fills from Investigation__c.
  const [investigation, setInvestigation] = useState("");
  const [problemAreaIds, setProblemAreaIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setStaffId(""); setServiceId("");
      setInvestigation("");
      setAppointmentStatus("Reserved"); setAppointmentType("Walk-in");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setStartTime("10:00"); setEndTime("10:30");
      setProblemAreaIds([]);
    }
  }, [open]);

  const { data: staffList = [] } = useQuery({
    queryKey: ["quick-appt-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff").select("id, first_name, last_name, role").eq("is_active", true).order("first_name");
      if (error) throw error; return data || [];
    },
    enabled: open,
  });

  // Booking from a patient's record left the doctor blank, so front desk picked
  // from memory the one that patient always sees. Their last visit already says
  // who that is. Only fetched once the dialog is open, so it costs nothing until
  // somebody books.
  const { data: recentVisits = [] } = useQuery({
    queryKey: ["quick-appt-recent-visits", patient?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("start_time, staff_id")
        .eq("patient_id", patient.id)
        .order("start_time", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!patient?.id,
  });

  // Fills a blank only: a doctor chosen by hand is never overridden, and the
  // reset above still clears it when the dialog closes.
  useEffect(() => {
    if (!open || staffId) return;
    const usual = usualDoctorId(
      recentVisits as PastVisit[],
      (staffList as { id: string }[]).map((d) => d.id),
    );
    if (usual) setStaffId(usual);
  }, [open, staffId, recentVisits, staffList]);

  const { data: services = [] } = useQuery({
    queryKey: ["quick-appt-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name").order("name");
      if (error) throw error; return data || [];
    },
    enabled: open,
  });

  const { data: problemAreas = [] } = useQuery({
    queryKey: ["quick-appt-problem-areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("problem_areas").select("id, name").eq("is_active", true).order("name");
      if (error) throw error; return data || [];
    },
    enabled: open,
  });

  const handleStartTimeChange = (v: string) => {
    setStartTime(v);
    const [h, m] = v.split(":").map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      const total = (h * 60 + m + 15) % (24 * 60);
      setEndTime(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("Please pick a date");
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const start = new Date(date); start.setHours(sh, sm, 0, 0);
      const end = new Date(date); end.setHours(eh, em, 0, 0);
      if (end <= start) throw new Error("End time must be after start time");
      if (start < new Date()) throw new Error("Cannot book appointments in the past");
      const serviceName = services.find((s: any) => s.id === serviceId)?.name || "";
      const { error } = await supabase.from("appointments").insert({
        patient_id: patient.id,
        patient_name: `${patient.first_name} ${patient.last_name}`.trim(),
        staff_id: staffId || null,
        therapist_id: therapistId || null,
        service: serviceName,
        status: appointmentStatus,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        is_recurring: false,
        source: "Walk-in",
        appointment_type: appointmentType,
        reason_for_consultation: investigation.trim() || null,
        problem_area_ids: problemAreaIds,
      } as any);
      if (error) throw error;
      return { start, serviceName };
    },
    onSuccess: (data) => {
      toast.success("Appointment created");
      queryClient.invalidateQueries({ queryKey: ["patient-appointments", patient.id] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      // Only a Confirmed appointment is worth messaging a patient about, matching
      // the Appointments module. This dialog defaults to "Reserved", a provisional
      // hold - confirming it later sends the same template from the status-change
      // path there.
      if (APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED && patient.phone && data && appointmentStatus === "Confirmed") {
        const patientName = `${patient.first_name} ${patient.last_name}`.trim();
        supabase.functions.invoke("send-appointment-whatsapp", {
          body: {
            phone: patient.phone,
            patientName,
            appointmentDate: format(data.start, "dd MMM yyyy"),
            appointmentTime: format(data.start, "hh:mm a"),
            serviceName: data.serviceName,
            patientGender: patient.gender,
          },
        }).then(({ error }) => {
          if (error) console.error("WhatsApp send failed:", error);
          else toast.success("WhatsApp confirmation sent");
        });
      }
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Failed to create appointment"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Locked patient summary */}
          <div className="rounded-md border bg-muted/40 px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserIcon className="h-3.5 w-3.5 text-primary" />
              {patient.first_name} {patient.last_name}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><IdCard className="h-3 w-3" /> {shortPatientId(patient.id)}</span>
              {patient.phone && (
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {patient.phone}</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Doctor</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {staffList.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}{d.role ? ` · ${d.role}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Therapist</Label>
              <StaffCombobox
                className="mt-1.5"
                value={therapistId}
                onValueChange={setTherapistId}
                roleFilter={[...THERAPIST_ROLES]}
                allowNone
                noneLabel="No therapist assigned"
                placeholder="Select"
              />
            </div>
            <div>
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {services.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Appointment Type</Label>
              <Select value={appointmentType} onValueChange={(v) => setAppointmentType(v as any)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Walk-in">Walk-in</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={appointmentStatus} onValueChange={setAppointmentStatus}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <DateInput value={date} onChange={(isoDate) => setDate(isoDate)} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start</Label>
                <TimePicker12h value={startTime} onChange={handleStartTimeChange} className="mt-1.5" />
              </div>
              <div>
                <Label>End</Label>
                <TimePicker12h value={endTime} onChange={setEndTime} className="mt-1.5" />
              </div>
            </div>
          </div>

          <div>
            <Label>Primary Concern</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full mt-1.5 justify-start text-left font-normal", problemAreaIds.length === 0 && "text-muted-foreground")}
                >
                  {problemAreaIds.length === 0
                    ? "Select primary concern"
                    : (problemAreas as any[]).filter((p: any) => problemAreaIds.includes(p.id)).map((p: any) => p.name).join(", ")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2 max-h-64 overflow-y-auto" align="start">
                {(problemAreas as any[]).map((pa: any) => (
                  <label key={pa.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={problemAreaIds.includes(pa.id)}
                      onCheckedChange={(c) => setProblemAreaIds((prev) => (c ? [...prev, pa.id] : prev.filter((id) => id !== pa.id)))}
                    />
                    {pa.name}
                  </label>
                ))}
                {(problemAreas as any[]).length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">No primary concerns configured.</p>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Investigation. Reason for Consultation now lives on the patient. */}
          <div>
            <Label>Investigation</Label>
            <Textarea
              value={investigation}
              onChange={(e) => setInvestigation(e.target.value)}
              placeholder="What was investigated at this visit"
              rows={2}
              className="mt-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}