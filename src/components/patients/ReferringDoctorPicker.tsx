import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * Pick the doctor who referred a patient.
 *
 * This list lived inside the Add Patient form and nowhere else, so editing a
 * patient on the Details tab offered a plain text box for the same field: the
 * clinic picked "Dr. Shetty" from a list on registration and then typed it
 * freehand - or differently - every time afterwards. One component now, used by
 * both, because a picker on one screen and a text box on the other is how a
 * list of four doctors turns into eight spellings of their names.
 *
 * It holds its own list, its own search and its own add/delete dialogs so a
 * screen can show it without wiring any of that up.
 */

interface ReferralDoctor {
  id: string;
  display_name: string;
  type: "internal" | "external";
  role?: string | null;
  specialization?: string | null;
}

interface ReferringDoctorPickerProps {
  /** The doctor's name, which is what the column stores. */
  value: string | null | undefined;
  onChange: (name: string) => void;
  disabled?: boolean;
  /** Set on the trigger button, for the Details tab's denser rows. */
  className?: string;
  placeholder?: string;
}

export function ReferringDoctorPicker({
  value,
  onChange,
  disabled,
  className,
  placeholder = "Select referring doctor...",
}: ReferringDoctorPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");
  const { toast } = useToast();

  const { data: doctors = [], refetch } = useQuery({
    // Same key the Add form used, so both screens share one cached list.
    queryKey: ["referral-doctors-list"],
    queryFn: async (): Promise<ReferralDoctor[]> => {
      const [staffResult, externalResult] = await Promise.all([
        supabase
          .from("staff")
          .select("id, first_name, last_name, role, specialization")
          .in("role", ["Doctor", "Referral Doctor"])
          .eq("is_active", true)
          .order("first_name"),
        supabase.from("external_doctors").select("id, name, specialization").order("name"),
      ]);

      const staffDocs: ReferralDoctor[] = (staffResult.data || []).map((s) => ({
        id: s.id,
        type: "internal",
        role: s.role,
        specialization: s.specialization,
        display_name: `${s.first_name} ${s.last_name}`,
      }));

      const externalDocs: ReferralDoctor[] = (externalResult.data || []).map((e) => ({
        id: e.id,
        type: "external",
        specialization: e.specialization,
        display_name: e.name,
      }));

      return [...staffDocs, ...externalDocs].sort((a, b) =>
        a.display_name.localeCompare(b.display_name)
      );
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return doctors;
    // Searched on first_name/last_name before, which an external doctor does not
    // have - it carries a single `name`. So typing an external doctor's name
    // matched "undefined undefined" and found nobody, and the four external
    // doctors could only be reached by scrolling. display_name covers both.
    return doctors.filter(
      (d) =>
        d.display_name.toLowerCase().includes(q) ||
        (d.specialization || "").toLowerCase().includes(q)
    );
  }, [doctors, search]);

  const addDoctor = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Error", description: "Please enter doctor name" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("external_doctors").insert({ name }).select();
      if (error) throw error;
      if (data && data[0]) {
        onChange(data[0].name);
        await refetch();
        toast({ title: "Success", description: "Doctor added successfully" });
      }
      setAddOpen(false);
      setNewName("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const deleteDoctor = async (doctorId: string) => {
    try {
      const { error } = await supabase.from("external_doctors").delete().eq("id", doctorId);
      if (error) throw error;
      await refetch();
      setDeletingId(null);
      setDeletingName("");
      toast({ title: "Doctor deleted successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn("w-full justify-between font-normal", className)}
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-2" align="start">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search doctors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 shrink-0"
              onClick={() => setAddOpen(true)}
              title="Add new doctor"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No doctors found.</p>
            ) : (
              filtered.map((d) => {
                const selected = value === d.display_name;
                return (
                  <div key={d.id} className="group relative">
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 hover:bg-accent",
                        selected && "bg-accent"
                      )}
                      onClick={() => {
                        onChange(d.display_name);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check className={cn("h-3.5 w-3.5", selected ? "opacity-100" : "opacity-0")} />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{d.display_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {d.type === "external"
                            ? "External Doctor"
                            : [d.role, d.specialization].filter(Boolean).join(" · ")}
                          {d.specialization && d.type === "external" && ` · ${d.specialization}`}
                        </p>
                      </div>
                    </button>
                    {d.type === "external" && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-destructive transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(d.id);
                          setDeletingName(d.display_name);
                        }}
                        title="Delete external doctor"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add External Doctor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="referring-doctor-name">Doctor Name *</Label>
              <Input
                id="referring-doctor-name"
                placeholder="e.g., Dr. John Smith"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setAddOpen(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => void addDoctor()}
                disabled={saving || !newName.trim()}
              >
                {saving ? "Adding..." : "Add Doctor"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletingId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeletingId(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Doctor?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-medium">{deletingName}</span>? This
            action cannot be undone.
          </p>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => deletingId && void deleteDoctor(deletingId)}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
