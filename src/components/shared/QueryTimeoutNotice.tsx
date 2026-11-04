import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Postgres cancels a statement that runs past the timeout; PostgREST forwards it
 * as code 57014. Without this the screen just shows an empty list, which reads as
 * "no records" rather than "the request was cancelled".
 */
export function isTimeoutError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as any)?.code;
  const message = (error as any)?.message || "";
  return code === "57014" || /statement timeout|canceling statement/i.test(String(message));
}

interface Props {
  error: unknown;
  onRetry: () => void;
  className?: string;
}

export function QueryTimeoutNotice({ error, onRetry, className }: Props) {
  if (!error) return null;
  const timedOut = isTimeoutError(error);
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${className || ""}`}>
      <div className="flex items-start gap-2 text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <span>
          {timedOut
            ? "This took too long to load. Try a narrower date range or a more specific search."
            : "We couldn't load these records."}
        </span>
      </div>
      <Button size="sm" variant="outline" className="gap-2 self-start sm:self-auto" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}
