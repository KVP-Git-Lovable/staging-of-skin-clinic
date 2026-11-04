import { useState } from "react";
import { AlertTriangle, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readImpersonation, stopImpersonation } from "@/lib/impersonation";
import { toast } from "sonner";

/**
 * Shown on every in-app screen while an admin is acting as someone else, so it is
 * never possible to forget whose account is being used.
 */
export function ImpersonationBanner() {
  const state = readImpersonation();
  const [busy, setBusy] = useState(false);
  if (!state) return null;

  const handleReturn = async () => {
    setBusy(true);
    try {
      await stopImpersonation();
      window.location.href = "/";
    } catch (e: any) {
      setBusy(false);
      toast.error(e?.message ?? "Could not return to your account");
      window.location.href = "/login";
    }
  };

  return (
    <div className="bg-destructive text-destructive-foreground px-3 md:px-4 py-2 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 min-w-0 text-xs md:text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="truncate">
          You are acting as <span className="font-semibold">{state.targetName}</span>. Everything you do
          is recorded as that person.
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 gap-1.5"
        onClick={handleReturn}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        Return to my account
      </Button>
    </div>
  );
}
