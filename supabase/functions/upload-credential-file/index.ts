// Stores one credential or CPD certificate file (CRD-05, CRD-16, CRD-18) in the private
// `credentials` bucket. Browsers call it with the signed-in user's token; nobody can write
// to the bucket directly.
//
// 1. The user's own token asks the database where the file may go
//    (credential_upload_target / cpd_upload_target refuse anyone who may not add files).
// 2. The file is checked here: at most 10 MB, and PDF / JPEG / PNG by its first bytes, not
//    by the name or the browser's claimed type; it must also be a type the credential
//    type accepts.
// 3. It is written with the service role, and recorded (credential_files, or the CPD
//    activity's file_path). A failed record removes the file again.
//
// Deployed with --no-verify-jwt because the token is checked here (auth.getUser), which also
// works with Supabase's newer signing keys. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Request: POST multipart/form-data { kind: "credential" | "cpd", id: uuid, file }.
// Response: 200 { path } or 4xx { error: "no_file" | "too_big" | "bad_type" | "forbidden" … }.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const MAX_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** The real file type from its first bytes. */
function sniff(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return "image/png";
  return null;
}

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** "{timestamp}-{safe name}.{ext}" — ASCII only, no path characters. */
function objectName(fileName: string, mime: string) {
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${Date.now()}-${base || "file"}.${EXT[mime]}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer "))
    return json(401, { error: "unauthorised" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoError } = await asUser.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (whoError || !who.user) return json(401, { error: "unauthorised" });

  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  const id = form?.get("id");
  const file = form?.get("file");
  if (
    (kind !== "credential" && kind !== "cpd") ||
    typeof id !== "string" ||
    !UUID.test(id)
  )
    return json(400, { error: "bad_request" });
  if (!(file instanceof File) || file.size === 0)
    return json(400, { error: "no_file" });
  if (file.size > MAX_BYTES) return json(413, { error: "too_big" });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) return json(415, { error: "bad_type" });

  // Where it may go, decided by the database as this user.
  const target =
    kind === "credential"
      ? await asUser
          .rpc("credential_upload_target", { p_credential_id: id })
          .single()
      : await asUser.rpc("cpd_upload_target", { p_activity_id: id }).single();
  if (target.error || !target.data) return json(403, { error: "forbidden" });
  const t = target.data as {
    tenant_id: string;
    folder: string;
    allowed_mime?: string[];
    next_page?: number;
    old_path?: string | null;
  };
  if (t.allowed_mime && !t.allowed_mime.includes(mime))
    return json(415, { error: "bad_type" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const path = `${t.folder}${objectName(file.name, mime)}`;
  const stored = await admin.storage
    .from("credentials")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (stored.error) return json(500, { error: "upload_failed" });

  const recorded =
    kind === "credential"
      ? await admin.from("credential_files").insert({
          tenant_id: t.tenant_id,
          staff_credential_id: id,
          file_path: path,
          mime,
          size_bytes: file.size,
          page_no: t.next_page ?? 1,
          uploaded_by: who.user.id,
        })
      : await admin
          .from("cpd_activities")
          .update({ file_path: path })
          .eq("id", id);
  if (recorded.error) {
    await admin.storage.from("credentials").remove([path]);
    return json(500, { error: "record_failed" });
  }
  if (kind === "cpd" && t.old_path) {
    await admin.storage.from("credentials").remove([t.old_path]);
  }
  return json(200, { path });
});
