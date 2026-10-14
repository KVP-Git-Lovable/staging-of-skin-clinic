import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AudienceBuilder } from "@/components/communications/journey/AudienceBuilder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { emptyCanvas } from "@/lib/comms/journeyGraph";
import type { AudienceConfig, Journey } from "@/lib/comms/journeys";

// One dialog for both flows: no `journey` = Create, a journey = Edit details.
export function JourneyDetailsDialog({
  open,
  onOpenChange,
  journey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journey?: Journey | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<AudienceConfig | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(journey?.name ?? "");
    setDescription(journey?.description ?? "");
    setAudience(journey?.audience_config ?? null);
  }, [open, journey]);

  const audienceChanged = !!journey && JSON.stringify(audience) !== JSON.stringify(journey.audience_config);
  const resetsApproval = audienceChanged && journey?.approval_status === "approved";

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), description: description.trim() || null, audience_config: audience };
      if (journey) {
        const { error } = await supabase.from("comms_journeys").update(payload as never).eq("id", journey.id);
        if (error) throw error;
        return null;
      }
      const { data, error } = await supabase
        .from("comms_journeys")
        .insert({ ...payload, canvas_data: emptyCanvas() } as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["comms-journeys"] });
      qc.invalidateQueries({ queryKey: ["comms-journey", journey?.id] });
      onOpenChange(false);
      if (newId) {
        toast.success("Journey created");
        navigate(`/communications/journeys/${newId}`);
      } else toast.success(resetsApproval ? "Saved — this journey needs approval again" : "Journey updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{journey ? "Edit Journey" : "Create Journey"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="journey-name">Name</Label>
            <Input id="journey-name" className="mt-1.5" placeholder="e.g., Welcome Series" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="journey-desc">Description</Label>
            <Textarea id="journey-desc" className="mt-1.5" placeholder="Describe the journey purpose..." value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <AudienceBuilder value={audience} onChange={setAudience} />
          {resetsApproval && (
            <p className="rounded-md bg-warning/10 p-3 text-sm text-warning">
              Changing the audience of an approved journey sends it back to Draft — it will need to be approved again.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {journey ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
