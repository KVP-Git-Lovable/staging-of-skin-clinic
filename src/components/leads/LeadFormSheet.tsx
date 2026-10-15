import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/listViews/leadFields";

export interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  source: string | null;
  interest: string | null;
  status: string;
  owner_id: string | null;
  notes: string | null;
  source_ref: string | null;
  converted_patient_id: string | null;
  created_at: string;
  updated_at: string;
}

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

const empty = { name: "", phone: "", email: "", city: "", source: "Walk-in", interest: "", status: "new", owner_id: "", notes: "" };

export function LeadFormSheet({
  open,
  onOpenChange,
  lead,
  onSaved,
  onConvert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadRow | null;
  onSaved: () => void;
  onConvert?: (lead: LeadRow) => void;
}) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      lead
        ? { name: lead.name, phone: lead.phone, email: lead.email ?? "", city: lead.city ?? "", source: lead.source ?? "Other", interest: lead.interest ?? "", status: lead.status, owner_id: lead.owner_id ?? "", notes: lead.notes ?? "" }
        : empty
    );
  }, [open, lead]);

  const { data: staff = [] } = useQuery({
    queryKey: ["leads-staff"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Same number already saved as another lead?
  const { data: duplicate } = useQuery({
    queryKey: ["lead-duplicate", last10(form.phone), lead?.id],
    enabled: open && last10(form.phone).length >= 10,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("id, name, phone").ilike("phone", `%${last10(form.phone)}`).limit(5);
      return (data || []).find((l) => l.id !== lead?.id && last10(l.phone) === last10(form.phone)) ?? null;
    },
  });

  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && last10(form.phone).length >= 8 && (!form.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email));
  const sources = useMemo(() => (LEAD_SOURCES.includes(form.source) ? LEAD_SOURCES : [...LEAD_SOURCES, form.source]), [form.source]);

  const save = async () => {
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      source: form.source || null,
      interest: form.interest.trim() || null,
      status: form.status,
      owner_id: form.owner_id || null,
      notes: form.notes.trim() || null,
    };
    const { error } = lead ? await supabase.from("leads").update(payload).eq("id", lead.id) : await supabase.from("leads").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(lead ? "Lead updated" : "Lead added");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{lead ? "Edit Lead" : "Add Lead"}</SheetTitle>
          <SheetDescription>{lead?.source_ref ? `From ${lead.source_ref}` : "Someone who has shown interest but is not yet a patient."}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="lead-name">Name *</Label>
            <Input id="lead-name" className="mt-1.5" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="lead-phone">Phone *</Label>
              <Input id="lead-phone" className="mt-1.5" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              {duplicate && <p className="mt-1 text-xs text-warning">Another lead ({duplicate.name}) already has this number.</p>}
            </div>
            <div>
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" className="mt-1.5" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="lead-city">City</Label>
              <Input id="lead-city" className="mt-1.5" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => set("source", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lead-interest">Interested in</Label>
            <Input id="lead-interest" className="mt-1.5" placeholder="e.g. Acne treatment, Laser hair reduction" value={form.interest} onChange={(e) => set("interest", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Owner</Label>
              <Select value={form.owner_id || "none"} onValueChange={(v) => set("owner_id", v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{`${s.first_name} ${s.last_name || ""}`.trim()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea id="lead-notes" className="mt-1.5" rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <SheetFooter className="gap-2 sm:justify-between">
          {lead && !lead.converted_patient_id && onConvert ? (
            <Button type="button" variant="outline" onClick={() => onConvert(lead)}>
              <UserCheck className="mr-2 h-4 w-4" /> Convert to patient
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!valid || saving} onClick={save}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
