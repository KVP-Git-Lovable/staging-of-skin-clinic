import { useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAppUsers } from "@/hooks/useAppUsers";
import { toast } from "sonner";

interface Props {
  /** Table the record lives in, e.g. "patients". */
  objectType: "patients" | "appointments" | "procedures" | "invoices" | "pharma_bills";
  objectLabel: string;
  recordId: string;
  recordLabel: string;
  ownerId?: string | null;
  /** Path to the record, used in the notification link. */
  link?: string;
  canChange?: boolean;
  onChanged?: (ownerId: string) => void;
  className?: string;
  /** "card" = boxed field inside System Record, "inline" = compact header field. */
  variant?: "card" | "inline";
}

/**
 * Standard "Record Owner" lookup shown on every record. The owner is a system
 * user; changing it can optionally notify the new owner in-app and by email.
 * Created by / modified by are untouched by an ownership change.
 */
export function RecordOwnerField({
  objectType,
  objectLabel,
  recordId,
  recordLabel,
  ownerId,
  link,
  canChange = true,
  onChanged,
  className = "",
  variant = "card",
}: Props) {
  const { data: users = [] } = useAppUsers();
  const [open, setOpen] = useState(false);
  // Local copy so the new owner name renders instantly, before the record refetches.
  const [localOwner, setLocalOwner] = useState<string | null>(ownerId ?? null);
  const effectiveOwner = localOwner ?? ownerId ?? null;
  const [nextOwner, setNextOwner] = useState<string>(ownerId ?? "");
  const [notifyApp, setNotifyApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reset the optimistic value whenever a different record (or a refetched owner)
  // is rendered, so a previous record's owner never sticks around.
  useEffect(() => {
    setLocalOwner(ownerId ?? null);
    setNextOwner(ownerId ?? "");
  }, [recordId, ownerId]);

  const ownerName =
    users.find((u) => u.auth_user_id === effectiveOwner)?.name ?? (effectiveOwner ? "User" : "—");


  const save = async () => {
    if (!nextOwner || nextOwner === effectiveOwner) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from(objectType)
      .update({ owner_id: nextOwner } as any)
      .eq("id", recordId);
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }

    // Reflect the new owner instantly; notifications continue in the background.
    setLocalOwner(nextOwner);
    setSaving(false);
    setOpen(false);
    toast.success("Record owner updated");
    onChanged?.(nextOwner);

    if (notifyApp || notifyEmail) {
      supabase.functions
        .invoke("notify-record-owner", {
          body: {
            new_owner_id: nextOwner,
            object_type: objectType,
            object_label: objectLabel,
            record_id: recordId,
            record_label: recordLabel,
            link: link ?? null,
            notify_app: notifyApp,
            notify_email: notifyEmail,
          },
        })
        .then(({ error: fnError }) => {
          if (fnError) toast.warning("Owner changed, but the notification could not be sent.");
        });
    }
  };

  return (
    <>
      {variant === "inline" ? (
        <div className={`min-w-[170px] rounded-lg border bg-card px-3 py-1.5 ${className}`}>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <UserCog className="h-3 w-3" />
            <span className="truncate">Record Owner</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{ownerName}</p>
            {canChange && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] shrink-0"
                onClick={() => { setNextOwner(effectiveOwner ?? ""); setOpen(true); }}
              >
                Change
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className={`rounded-lg border bg-muted/30 px-3 py-2 ${className}`}>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <UserCog className="h-3.5 w-3.5" />
            <span className="truncate">Record Owner</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-sm font-medium break-words">{ownerName}</p>
            {canChange && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => { setNextOwner(effectiveOwner ?? ""); setOpen(true); }}
              >
                Change
              </Button>
            )}
          </div>
        </div>
      )}


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change record owner</DialogTitle>
            <DialogDescription>
              Assign {objectLabel.toLowerCase()} “{recordLabel}” to another user. Created by and modified by stay unchanged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>New owner</Label>
              <Select value={nextOwner} onValueChange={setNextOwner}>
                <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
                <SelectContent className="z-50 max-h-72 bg-popover">
                  {users.map((u) => (
                    <SelectItem key={u.auth_user_id} value={u.auth_user_id}>
                      {u.name}{u.role ? ` — ${u.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={notifyApp} onCheckedChange={(v) => setNotifyApp(!!v)} />
                Send notification to the new owner
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={notifyEmail} onCheckedChange={(v) => setNotifyEmail(!!v)} />
                Also send an email to the new owner
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !nextOwner}>
              {saving ? "Saving..." : "Change owner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default RecordOwnerField;
