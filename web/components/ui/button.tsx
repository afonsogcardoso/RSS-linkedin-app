import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-primary px-5 py-3 text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary px-5 py-3 text-secondary-foreground hover:bg-secondary/90",
        outline:
          "border border-border/80 bg-card/70 px-5 py-3 text-foreground hover:bg-muted/80",
        ghost: "px-4 py-2.5 text-foreground hover:bg-muted"
      },
      size: {
        default: "",
        sm: "px-4 py-2 text-sm",
        lg: "px-6 py-3.5"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);

Button.displayName = "Button";

export { Button };
