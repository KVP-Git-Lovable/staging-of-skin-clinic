import * as React from "react";

import { cn } from "@/lib/utils";
import { armAutocorrect } from "@/lib/autocorrect/focus";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, spellCheck, onFocus, ...props }, ref) => {
    // Free-text boxes get the browser's red underline + right-click suggestions;
    // emails, phones, numbers, passwords, dates etc. stay unchecked.
    const isProse = !type || type === "text" || type === "search";
    return (
      <input
        type={type}
        spellCheck={spellCheck ?? isProse}
        autoCorrect={isProse ? "on" : "off"}
        onFocus={(e) => {
          if (isProse && type !== "search") armAutocorrect(e.currentTarget);
          onFocus?.(e);
        }}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input/80 bg-background/60 px-3 py-2 text-base shadow-sm backdrop-blur-sm ring-offset-background transition-[background-color,border-color,box-shadow] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-primary/25 hover:bg-background/75 focus-visible:border-primary/45 focus-visible:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:shadow-[var(--shadow-control)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none motion-reduce:transition-none md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
