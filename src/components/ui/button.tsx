import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

// ui-system.md §4 Buttons. `accent` is the one rust CTA per screen (§1.2, §6.4).
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control border border-transparent text-label whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-40 aria-busy:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white hover:bg-primary-hover active:bg-primary-strong",
        accent:
          "bg-accent text-base font-bold text-white hover:bg-accent-hover active:bg-accent-strong",
        outline:
          "border-[1.5px] border-primary bg-surface text-primary-strong hover:bg-primary-tint active:bg-primary-tint active:text-primary-strong",
        "danger-outline":
          "border-[1.5px] border-danger bg-surface text-danger hover:bg-danger-tint active:bg-danger-tint",
        // White buttons on the green hero card.
        "on-hero":
          "bg-surface text-ink hover:bg-canvas active:bg-primary-tint [&_svg]:text-ink-soft",
        ghost: "text-ink-soft hover:bg-canvas active:bg-track",
        link: "h-auto rounded-sm px-0 text-primary underline-offset-4 hover:underline active:text-primary-strong",
      },
      size: {
        // 52 px on mobile, 48 px from md up (§4 Buttons).
        default: "h-13 px-6 md:h-12",
        // Compact row actions (Approve / Review); still a 44 px touch target.
        row: "h-11 px-5",
        icon: "size-11 rounded-full",
      },
      block: { true: "w-full" },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner, sets aria-busy and blocks clicks (§4.1 loading). */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <LoaderCircle aria-hidden className="animate-spin" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
