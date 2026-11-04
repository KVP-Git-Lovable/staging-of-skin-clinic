import * as React from "react";

import { cn } from "@/lib/utils";
import { armAutocorrect } from "@/lib/autocorrect/focus";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Every prose box in the app - Symptoms, Diagnosis, Procedure Notes,
 * Recommendations and the rest - is one of these, so the spelling settings
 * belong here rather than on each field.
 *
 * The browser draws the red underline and the suggestion menu; a web page
 * cannot. What it can do is say plainly that this text should be checked,
 * instead of leaving it to be inherited - an ancestor, or the frame the app is
 * previewed in, can otherwise switch it off for everything inside.
 *
 * autoCorrect and autoCapitalize are for tablets: they turn on the on-screen
 * keyboard's own correction and sentence capitals, which is where an iPad user
 * gets the same help.
 *
 * Any field can still override all three by passing its own value.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, spellCheck = true, autoCorrect = "on", autoCapitalize = "sentences", onFocus, ...props }, ref) => {
  return (
    <textarea
      spellCheck={spellCheck}
      autoCorrect={autoCorrect}
      autoCapitalize={autoCapitalize}
      onFocus={(e) => {
        armAutocorrect(e.currentTarget);
        onFocus?.(e);
      }}
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-input/80 bg-background/60 px-3 py-2 text-sm shadow-sm backdrop-blur-sm ring-offset-background transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-primary/25 hover:bg-background/75 focus-visible:border-primary/45 focus-visible:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:shadow-[var(--shadow-control)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none motion-reduce:transition-none",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
