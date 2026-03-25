import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/90", className)}
      {...props}
    />
  );
}

export { Skeleton };
