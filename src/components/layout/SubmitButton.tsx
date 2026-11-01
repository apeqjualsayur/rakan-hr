"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Submit button that shows the loading state while its form's action runs.
export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "accent";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} block loading={pending}>
      {children}
    </Button>
  );
}
