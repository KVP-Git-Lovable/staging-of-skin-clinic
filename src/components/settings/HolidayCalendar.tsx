import { useState, useEffect } from "react";
import { X, Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface Holiday {
  id: string;
  date: string;
  name: string;
  description: string | null;
}

export function HolidayCalendar() {
  const [open, setOpen] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayDescription, setHolidayDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("holidays")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return (data as Holiday[]) || [];
    },
  });

  const handleAddHoliday = async () => {
    if (!holidayDate.trim() || !holidayName.trim()) {
      toast({ title: "Error", description: "Please fill in date and name", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any).from("holidays").insert({
        date: holidayDate,
        name: holidayName.trim(),
        description: holidayDescription.trim() || null,
      });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast({ title: "Success", description: "Holiday added successfully" });

      setHolidayDate("");
      setHolidayName("");
      setHolidayDescription("");
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      const { error } = await (supabase as any).from("holidays").delete().eq("id", id);
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast({ title: "Success", description: "Holiday deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Holiday Dates
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Appointments cannot be booked on these dates.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Holiday
        </Button>
      </div>

      {holidays.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No holidays configured. Click "Add Holiday" to set unavailable dates.
        </div>
      ) : (
        <div className="space-y-2">
          {holidays.map((holiday) => (
            <div
              key={holiday.id}
              className="flex items-start justify-between rounded-lg border p-3 hover:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{holiday.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(holiday.date), "EEE, MMM d, yyyy")}
                </p>
                {holiday.description && (
                  <p className="text-xs text-muted-foreground mt-1">{holiday.description}</p>
                )}
              </div>
              <button
                onClick={() => handleDeleteHoliday(holiday.id)}
                className="ml-2 shrink-0 rounded p-1 hover:bg-destructive/20 text-destructive transition-colors"
                title="Delete holiday"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Holiday</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="holiday-date">Date *</Label>
              <Input
                id="holiday-date"
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="holiday-name">Holiday Name *</Label>
              <Input
                id="holiday-name"
                placeholder="e.g., Diwali, New Year"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="holiday-desc">Description (optional)</Label>
              <Textarea
                id="holiday-desc"
                placeholder="Additional notes..."
                value={holidayDescription}
                onChange={(e) => setHolidayDescription(e.target.value)}
                className="mt-1.5"
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  setHolidayDate("");
                  setHolidayName("");
                  setHolidayDescription("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddHoliday}
                disabled={saving || !holidayDate || !holidayName}
              >
                {saving ? "Adding..." : "Add Holiday"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
