import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect } from "react";
import { formatElapsed, useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export interface MicButtonProps {
  value?: string;
  onChange: (next: string) => void;
  mode?: "append" | "replace";
  language?: string;
  className?: string;
  size?: "sm" | "md";
  title?: string;
  /** Called instead of onChange when you want to handle the raw final transcript yourself */
  onTranscript?: (text: string) => void;
}

/**
 * Reusable speech-to-text mic button.
 * - Click to start recording, click again to stop.
 * - Shows red pulsing dot + MM:SS timer while recording.
 * - Transcript is appended/replaced into the field via onChange.
 */
export function MicButton({
  value = "",
  onChange,
  mode = "append",
  language = "en-IN",
  className,
  size = "sm",
  title,
  onTranscript,
}: MicButtonProps) {
  const { supported, listening, interimTranscript, elapsedMs, error, start, stop } =
    useSpeechRecognition({
      language,
      continuous: true,
      interimResults: true,
      onFinal: (text) => {
        if (onTranscript) {
          onTranscript(text);
          return;
        }
        if (mode === "replace") {
          onChange(text);
        } else {
          const sep = value && !value.endsWith(" ") ? " " : "";
          onChange((value || "") + sep + text);
        }
      },
    });

  useEffect(() => {
    if (error) {
      const msg =
        error === "not-allowed" || error === "service-not-allowed"
          ? "Microphone permission denied"
          : error === "no-speech"
          ? "Didn't catch that — try again"
          : `Voice error: ${error}`;
      toast.error(msg);
    }
  }, [error]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!supported) {
      toast.error("Voice input not supported in this browser");
      return;
    }
    if (listening) stop();
    else start();
  };

  const dim = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const iconCls = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Button
        type="button"
        variant={listening ? "destructive" : "ghost"}
        size="icon"
        className={cn(dim, "shrink-0")}
        onClick={handleClick}
        disabled={!supported}
        title={title || (supported ? (listening ? "Stop recording" : "Voice input") : "Voice input not supported")}
        aria-pressed={listening}
      >
        {listening ? <MicOff className={iconCls} /> : <Mic className={iconCls} />}
      </Button>
      {listening && (
        <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium" aria-live="polite">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
          </span>
          <span className="tabular-nums">{formatElapsed(elapsedMs)}</span>
          {interimTranscript && (
            <span className="hidden md:inline text-muted-foreground italic max-w-[200px] truncate">
              {interimTranscript}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default MicButton;