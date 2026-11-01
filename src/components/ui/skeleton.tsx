import { cn } from "@/lib/utils";

// §4.1 loading: skeleton blocks in the `track` colour.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-control bg-track", className)}
      {...props}
    />
  );
}

export { Skeleton };
