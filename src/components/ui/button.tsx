import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-[color,background-color,border-color,box-shadow,transform,filter] duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.975] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_6px_16px_-10px_hsl(var(--primary)/0.8)] hover:bg-primary/92 hover:shadow-[0_10px_22px_-12px_hsl(var(--primary)/0.75)]",
        destructive: "bg-destructive text-destructive-foreground shadow-sm shadow-destructive/15 hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/20",
        outline: "border border-border/70 bg-background/60 shadow-[var(--shadow-control)] backdrop-blur-md hover:border-primary/25 hover:bg-background/85 hover:text-accent-foreground hover:shadow-[var(--glass-shadow-hover)]",
        secondary: "border border-border/50 bg-secondary/70 text-secondary-foreground shadow-sm backdrop-blur-sm hover:bg-secondary/90 hover:shadow-md",
        ghost: "shadow-none hover:bg-accent/75 hover:text-accent-foreground hover:shadow-sm",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
