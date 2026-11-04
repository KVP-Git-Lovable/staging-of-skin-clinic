import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { assertWrote } from "@/lib/rowAccess";
import { PASSWORD_RULE_TEXT, passwordProblem } from "@/lib/passwordRules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Shown instead of the app when staff.force_password_change is set.
 *
 * An administrator types the first password and hands it over, so it is known
 * to at least two people. The flag has been written since April and read by
 * nothing, which meant those passwords simply stayed in place.
 *
 * Sign out is always available: if the update fails for any reason, nobody is
 * trapped in here.
 */
export function ChangePasswordRequired() {
  const { staffProfile, refreshStaffProfile, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The same rule User Management enforces. A looser one here would accept a
    // password the API then refuses, which is the confusing error it replaces.
    const problem = passwordProblem(password, confirm);
    if (problem) {
      toast.error(problem);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Only now clear the flag. Clearing it first would let a failed password
      // change through; leaving it set would loop the user back to this screen.
      if (staffProfile?.id) {
        const { data: written, error: flagError } = await supabase
          .from("staff")
          .update({ force_password_change: false } as never)
          .eq("id", staffProfile.id)
          .select("id");
        if (flagError) throw flagError;
        assertWrote(written);
      }

      await refreshStaffProfile();
      toast.success("Password updated");
    } catch (err) {
      toast.error((err as Error).message || "Could not update the password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold font-display">Choose your own password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your password was set for you. Pick one only you know before carrying on.
          </p>
          <p className="text-xs text-muted-foreground mt-2">{PASSWORD_RULE_TEXT}</p>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              className="mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="mt-1.5"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>

        <Button type="submit" className="w-full mt-5 gap-2" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save and continue
        </Button>

        <button
          type="button"
          className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
