"use client";

import { useState } from "react";
import { TextField } from "@/components/ui/TextField";
import { sanitizeCode } from "@/lib/auth/code";

// 6-digit one-time code: numeric keypad on phones, autofill from SMS / email on iOS.
export function CodeField({
  label,
  error,
  name = "code",
}: {
  label: string;
  error?: string;
  name?: string;
}) {
  const [code, setCode] = useState("");
  return (
    <TextField
      label={label}
      error={error}
      name={name}
      value={code}
      onChange={(event) => setCode(sanitizeCode(event.target.value))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      required
      autoFocus
      className="[&_input]:text-center [&_input]:text-h2 [&_input]:tracking-[0.5em]"
    />
  );
}
