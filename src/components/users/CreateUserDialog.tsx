import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { PASSWORD_RULE_TEXT, passwordProblem } from "@/lib/passwordRules";
import { CopyButton } from "@/components/shared/CopyButton";
import { credentialsMessage } from "@/lib/tempPassword";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  /** The one-time credentials on screen, or null when there are none to show. */
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forceChange, setForceChange] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

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
    setFormError(null);
    setIssued(null);
  };

  const closeDialog = () => {
    resetForm();
    onOpenChange(false);
  };

  const createUser = useMutation({
    mutationFn: async () => {
      if (!fullName.trim() || !email.trim()) throw new Error("Name and email are required");
      // Strength rules came from main. Shared, so the reset dialog and the
      // first-login screen cannot accept less than the API will.
      if (!autoGenPassword) {
        const problem = passwordProblem(password, confirmPassword);
        if (problem) throw new Error(problem);
      }

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
          send_email: false,
          force_password_change: forceChange,
        },
      });

      // supabase-js flattens any non-2xx into a generic "non-2xx status code"
      // and nulls out `data`, so the function's own message never reached the
      // toast below. edgeFunctionErrorMessage recovers it and translates a
      // weak-password rejection - main added that translation here; the shared
      // helper gives it to the three User Management call sites too, which can
      // hit exactly the same rejection.
      if (error) return { error: await edgeFunctionErrorMessage(error) };
      if (data?.error) return { error: data.error as string };

      // Update role on existing staff if linked
      if (staffId && roleId) {
        await supabase.from("staff").update({ role_id: roleId, is_active: isActive } as any).eq("id", staffId);
      }

      return { data };
    },
    onSuccess: (result) => {
      if (result.error) {
        setFormError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["staff-with-roles"] });
      toast({ title: "User created successfully" });

      // Shown once. Supabase keeps only the hash, so closing here without
      // showing it - which is what this did - loses the only copy.
      const temp = (result.data as { temp_password?: string | null } | undefined)?.temp_password;
      if (temp) {
        setIssued({ name: fullName, email, password: temp });
        return;
      }
      resetForm();
      onOpenChange(false);
    },
    onError: (err: any) => {
      setFormError(err instanceof Error ? err.message : "Could not create this user. Please try again.");
    },
  });

  // Filter to staff without auth_user_id
  const availableStaff = staffList.filter((s: any) => !s.auth_user_id);

  if (issued) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Login created for {issued.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4" data-testid="issued-credentials">
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-mono text-sm break-all">{issued.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Temporary password</p>
                <p className="font-mono text-lg font-bold tracking-wider break-all" data-testid="temp-password">
                  {issued.password}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Copy this now - it is shown only once and cannot be looked up later.
            </p>
            <div className="flex items-center gap-2">
              <CopyButton
                value={credentialsMessage({ name: issued.name, email: issued.email, password: issued.password })}
                label="Login details"
                className="h-9 w-9"
              />
              <span className="text-sm text-muted-foreground">Copy the whole message to send</span>
            </div>
            <Button className="w-full" data-testid="issued-done" onClick={closeDialog}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
                {/* Was "Auto-generate & send via email". create-user-account
                    sends no email - no Resend, no SMTP, no inviteUserByEmail
                    - so this created an account whose password nobody knew
                    and told the admin it had been posted. The password is
                    shown on screen when it is done instead. */}
                <Label>Auto-generate password</Label>
                <Switch checked={autoGenPassword} onCheckedChange={(checked) => { setAutoGenPassword(checked); setFormError(null); }} />
              </div>
              {!autoGenPassword && (
                <>
                  <div>
                    <Label>Password</Label>
                    <Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setFormError(null); }} placeholder="At least 8 characters" aria-invalid={Boolean(formError)} />
                    <p className="mt-1 text-xs text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
                  </div>
                  <div>
                    <Label>Confirm Password</Label>
                    <Input type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setFormError(null); }} aria-invalid={Boolean(formError)} />
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <Checkbox checked={forceChange} onCheckedChange={(v) => setForceChange(!!v)} id="force-change" />
                <Label htmlFor="force-change" className="text-sm font-normal">Force password change on first login</Label>
              </div>
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <Button className="w-full" onClick={() => { setFormError(null); createUser.mutate(); }} disabled={createUser.isPending || !fullName.trim() || !email.trim()}>
            {createUser.isPending ? "Creating..." : "Create User"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
