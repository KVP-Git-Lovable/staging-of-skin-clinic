import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";

function readResult(): Record<string, unknown> {
  try {
    const raw = new URLSearchParams(window.location.hash.slice(1)).get("result");
    const result = raw ? JSON.parse(raw) : null;
    if (result && typeof result === "object" &&
      (result.source === "meta-oauth" || result.source === "mailchimp-oauth") &&
      typeof result.ok === "boolean") return result;
  } catch { /* Show a safe failure state rather than crashing. */ }
  return { ok: false, error: "Missing connection result. Please try connecting again." };
}

export default function OAuthResult() {
  const [result] = useState(readResult);
  const ok = result.ok === true;

  useEffect(() => {
    // Clear the result from browser history after reading it.
    window.history.replaceState(null, "", window.location.pathname);
    if (!window.opener || !result.source) return;
    try {
      window.opener.postMessage(result, window.location.origin);
    } catch { /* The result remains visible if the opener is unavailable. */ }
    const timer = window.setTimeout(() => window.close(), 800);
    return () => window.clearTimeout(timer);
  }, [result]);

  const Icon = ok ? Check : X;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-5">
      <Card className="w-full max-w-md p-8 text-center shadow-lg sm:p-12" role="status">
        <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
          <Icon className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
        </div>
        <h1 className={`mb-2 text-2xl font-semibold ${ok ? "text-success" : "text-destructive"}`}>
          {ok ? "Success" : "Connection failed"}
        </h1>
        <p className="break-words text-sm leading-6 text-muted-foreground">
          {ok ? "You may close this window" : typeof result.error === "string" ? result.error : "Please try again."}
        </p>
      </Card>
    </main>
  );
}