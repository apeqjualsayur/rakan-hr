"use client";

import { createClient } from "@/lib/supabase/client";

// Browser side of the upload-credential-file Edge Function (CRD-05, CRD-16, CRD-18).
// The same limits are enforced by the function and the bucket; checking here first just
// gives a quicker message.

export const CREDENTIAL_FILES = {
  maxBytes: 10 * 1024 * 1024,
  mime: ["application/pdf", "image/jpeg", "image/png"],
  accept: "application/pdf,image/jpeg,image/png",
} as const;

export type UploadProblem =
  "fileType" | "fileTooBig" | "uploadFailed" | "forbidden";

export function fileProblem(file: {
  size: number;
  type: string;
}): UploadProblem | null {
  if (!(CREDENTIAL_FILES.mime as readonly string[]).includes(file.type))
    return "fileType";
  if (file.size > CREDENTIAL_FILES.maxBytes) return "fileTooBig";
  return null;
}

export async function uploadCredentialFile(
  kind: "credential" | "cpd",
  id: string,
  file: File,
): Promise<UploadProblem | null> {
  const body = new FormData();
  body.set("kind", kind);
  body.set("id", id);
  body.set("file", file);
  const { error } = await createClient().functions.invoke(
    "upload-credential-file",
    { body },
  );
  if (!error) return null;
  const status = (error as { context?: Response }).context?.status;
  if (status === 415) return "fileType";
  if (status === 413) return "fileTooBig";
  if (status === 401 || status === 403) return "forbidden";
  return "uploadFailed";
}

/**
 * Step 8 pre-boarding portal: candidates have no account, so the file goes to the app's
 * server (/api/preboarding/upload), which adds their pre-boarding session and passes it on
 * to the same Edge Function.
 */
export async function uploadPreboardingFile(
  id: string,
  file: File,
): Promise<UploadProblem | null> {
  const body = new FormData();
  body.set("kind", "credential");
  body.set("id", id);
  body.set("file", file);
  const res = await fetch("/api/preboarding/upload", { method: "POST", body });
  if (res.ok) return null;
  if (res.status === 415) return "fileType";
  if (res.status === 413) return "fileTooBig";
  if (res.status === 401 || res.status === 403) return "forbidden";
  return "uploadFailed";
}
