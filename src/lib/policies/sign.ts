import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { CurrentMember } from "@/lib/auth/member";
import { formatDate, formatTime } from "@/lib/format";
import { hex, safe, sha256Hex, wrap } from "@/lib/pdf";
import type { ErrorKey } from "@/lib/settings/form";
import { consentText, sameName } from "./logic";
import { POLICY_COLUMNS, type PolicyDocument } from "./types";

// POL-03 click-to-sign, reused by later steps (offers, contracts). For one document:
// 1. download the exact published PDF and check it still matches its fingerprint (SHA-256);
// 2. append a signature page: who, when (Malaysia time), IP, device, fingerprint, consent;
// 3. store the result once in the private `signed` bucket (insert-only: no overwrite);
// 4. record_signature() checks the name and audience again and records it, taking the
//    fingerprint from the published document rather than from this code.

export type SignResult = { ok: true } | { ok: false; error: ErrorKey };

const INK = hex("#1E2A24");
const MUTED = hex("#5B6B62");
const PRIMARY = hex("#1E6B52");

/** The client's IP and browser as seen by the server (best effort behind proxies). */
async function requestInfo() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return { ip, userAgent: (h.get("user-agent") ?? "unknown").slice(0, 500) };
}

export async function signPolicyDocument(
  supabase: SupabaseClient,
  member: CurrentMember,
  policyId: string,
  typedName: string,
  locale: string,
): Promise<SignResult> {
  const { data: doc } = await supabase
    .from("policy_documents")
    .select(POLICY_COLUMNS)
    .eq("id", policyId)
    .maybeSingle<PolicyDocument>();
  if (!doc || doc.superseded_at || !doc.requires_signature)
    return { ok: false, error: "notPending" };

  const { data: employee } = member.employeeId
    ? await supabase
        .from("employees")
        .select("full_name, employee_no")
        .eq("id", member.employeeId)
        .maybeSingle()
    : { data: null };
  if (
    !typedName.trim() ||
    (employee && !sameName(typedName, employee.full_name as string))
  )
    return { ok: false, error: "nameMismatch" };

  const { data: blob, error: downloadError } = await supabase.storage
    .from("policies")
    .download(doc.file_path);
  if (downloadError || !blob) return { ok: false, error: "notFound" };
  const original = new Uint8Array(await blob.arrayBuffer());
  if (sha256Hex(original) !== doc.document_sha256)
    return { ok: false, error: "documentChanged" };

  const signatureId = randomUUID();
  const { ip, userAgent } = await requestInfo();
  const signedAt = new Date();
  const consent = consentText(locale);

  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  const left = 56;
  const width = 595 - 2 * left;
  let y = 842 - 72;
  const text = (value: string, size: number, f = font, colour = INK) => {
    for (const line of wrap(f, value, size, width)) {
      page.drawText(line, { x: left, y, size, font: f, color: colour });
      y -= size + 5;
    }
  };
  const field = (label: string, value: string) => {
    text(label, 9, bold, MUTED);
    text(value, 11);
    y -= 8;
  };

  page.drawText("rakan", { x: left, y, size: 16, font: bold, color: PRIMARY });
  y -= 36;
  text("Signature record / Rekod tandatangan", 18, bold);
  y -= 10;
  field(
    "Document / Dokumen",
    `${doc.title_en} / ${doc.title_ms} (version ${doc.version})`,
  );
  field("Signed by (typed name) / Ditandatangani oleh", typedName.trim());
  if (employee)
    field(
      "Employee record / Rekod pekerja",
      `${employee.full_name} · ${employee.employee_no}`,
    );
  if (!employee && member.email) field("Account / Akaun", member.email);
  field(
    "Signed at / Ditandatangani pada",
    `${formatDate(signedAt, "en", "full")}, ${formatTime(signedAt, "en")} (Malaysia time) · ${signedAt.toISOString()}`,
  );
  field("IP address / Alamat IP", ip);
  field("Device / Peranti", userAgent);
  field(
    "Document fingerprint (SHA-256) / Cap jari dokumen",
    doc.document_sha256,
  );
  field("Signature ID / ID tandatangan", signatureId);
  text("Consent / Persetujuan", 9, bold, MUTED);
  text(safe(font, consent), 11);
  y -= 16;
  text(
    "The fingerprint identifies the exact document signed: the pages before this one. Any change to them gives a different fingerprint.",
    8,
    font,
    MUTED,
  );

  const path = `${doc.file_path.split("/")[0]}/policy_document/${doc.id}/${signatureId}.pdf`;
  const signedBytes = await pdf.save();
  const { error: uploadError } = await supabase.storage
    .from("signed")
    .upload(path, signedBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    console.error("signed upload failed", uploadError.message);
    return { ok: false, error: "saveFailed" };
  }

  const { error } = await supabase.rpc("record_signature", {
    p_signature_id: signatureId,
    p_entity_type: "policy_document",
    p_entity_id: doc.id,
    p_typed_name: typedName.trim(),
    p_consent_text: consent,
    p_ip: ip,
    p_user_agent: userAgent,
  });
  if (error) {
    const hint = `${error.message} ${error.hint ?? ""}`;
    if (hint.includes("name_mismatch"))
      return { ok: false, error: "nameMismatch" };
    if (hint.includes("already_signed"))
      return { ok: false, error: "alreadySigned" };
    if (hint.includes("not_signable"))
      return { ok: false, error: "notPending" };
    console.error("record_signature failed", error.code, error.message);
    return { ok: false, error: "saveFailed" };
  }
  return { ok: true };
}
