import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil } from "lucide-react";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staff: any | null;
  roles: any[];
}

export default function EditUserDialog({ open, onOpenChange, staff, roles }: EditUserDialogProps) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState<string>("none");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (staff && open) {
      setFirstName(staff.first_name || "");
      setLastName(staff.last_name || "");
      setEmail(staff.email || "");
      setPhone(staff.phone || "");
      setRoleId(staff.role_id || "none");
      setIsActive(!!staff.is_active);
    }
  }, [staff, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!staff) throw new Error("No user selected");
      if (!firstName.trim()) throw new Error("First name is required");
      const { error } = await supabase
        .from("staff")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim() || "-",
          email: email.trim() || null,
          phone: phone.trim() || null,
          role_id: roleId === "none" ? null : roleId,
          is_active: isActive,
        } as any)
        .eq("id", staff.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-with-roles"] });
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast({ title: "User updated" });
      onOpenChange(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" /> Edit User
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {staff?.auth_user_id && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Note: changing email here updates the staff record only. The login email is managed via password reset.
              </p>
            )}
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Role</SelectItem>
                {roles.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label>Status</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{isActive ? "Active" : "Inactive"}</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <Button className="w-full mt-2" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}