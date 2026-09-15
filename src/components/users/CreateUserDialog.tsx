import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { UserPlus } from "lucide-react";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffList: any[];
  roles: any[];
}

export default function CreateUserDialog({ open, onOpenChange, staffList, roles }: CreateUserDialogProps) {
  const queryClient = useQueryClient();
  const [linkedStaffId, setLinkedStaffId] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [autoGenPassword, setAutoGenPassword] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forceChange, setForceChange] = useState(true);

  // Auto-fill when staff member selected
  useEffect(() => {
    if (linkedStaffId && linkedStaffId !== "manual") {
      const s = staffList.find((st: any) => st.id === linkedStaffId);
      if (s) {
        setFullName(`${s.first_name} ${s.last_name}`.trim());
        setEmail(s.email || "");
        setPhone(s.phone || "");
      }
    }
  }, [linkedStaffId, staffList]);

  const resetForm = () => {
    setLinkedStaffId("");
    setFullName("");
    setEmail("");
    setPhone("");
    setRoleId("");
    setIsActive(true);
    setAutoGenPassword(true);
    setPassword("");
    setConfirmPassword("");
    setForceChange(true);
  };

  const createUser = useMutation({
    mutationFn: async () => {
      if (!fullName.trim() || !email.trim()) throw new Error("Name and email are required");
      if (!autoGenPassword && password !== confirmPassword) throw new Error("Passwords do not match");
      if (!autoGenPassword && password.length < 6) throw new Error("Password must be at least 6 characters");

      const staffId = linkedStaffId && linkedStaffId !== "manual" ? linkedStaffId : null;

      // If no staff linked, create a new staff record
      let finalStaffId = staffId;
      if (!finalStaffId) {
        const nameParts = fullName.trim().split(" ");
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ") || "-";
        const { data, error } = await supabase
          .from("staff")
          .insert({ first_name: firstName, last_name: lastName, email, phone: phone || null, role: "Staff", is_active: isActive, role_id: roleId || null } as any)
          .select("id")
          .single();
        if (error) throw error;
        finalStaffId = data.id;
      }

      // Call edge function to create auth user
      const { data, error } = await supabase.functions.invoke("create-user-account", {
        body: {
          staff_id: finalStaffId,
          email,
          password: autoGenPassword ? null : password,
          role_id: roleId || null,
          full_name: fullName,
          phone,
          send_email: autoGenPassword,
          force_password_change: forceChange,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update role on existing staff if linked
      if (staffId && roleId) {
        await supabase.from("staff").update({ role_id: roleId, is_active: isActive } as any).eq("id", staffId);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-with-roles"] });
      toast({ title: "User created successfully" });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Filter to staff without auth_user_id
  const availableStaff = staffList.filter((s: any) => !s.auth_user_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create User
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* PERSONAL INFO */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Personal Info</h3>
            <div className="space-y-3">
              <div>
                <Label>Link to Staff Member</Label>
                <Select value={linkedStaffId} onValueChange={setLinkedStaffId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member or enter manually" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">— Enter Manually —</SelectItem>
                    {availableStaff.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} {s.email ? `(${s.email})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Full Name *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@clinic.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ACCESS INFO */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Access Info</h3>
            <div className="space-y-3">
              <div>
                <Label>Role</Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Status</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{isActive ? "Active" : "Inactive"}</span>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* SECURITY */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Security</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Auto-generate & send via email</Label>
                <Switch checked={autoGenPassword} onCheckedChange={setAutoGenPassword} />
              </div>
              {!autoGenPassword && (
                <>
                  <div>
                    <Label>Password</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
                  </div>
                  <div>
                    <Label>Confirm Password</Label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <Checkbox checked={forceChange} onCheckedChange={(v) => setForceChange(!!v)} id="force-change" />
                <Label htmlFor="force-change" className="text-sm font-normal">Force password change on first login</Label>
              </div>
            </div>
          </div>

          <Button className="w-full" onClick={() => createUser.mutate()} disabled={createUser.isPending || !fullName.trim() || !email.trim()}>
            {createUser.isPending ? "Creating..." : "Create User"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
