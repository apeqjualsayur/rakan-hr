import { readSession } from "@/lib/hiring/preboarding";
import { requireSupabaseEnv } from "@/lib/supabase/env";

// HIR-04: a candidate's credential file, on its way to the upload-credential-file Edge
// Function. The browser cannot read the httpOnly session cookie, so this adds it as the
// x-preboarding-session header; the function checks the session, the file type (by its
// bytes) and the 10 MB limit, and the database checks where the file may go.
export async function POST(request: Request) {
  const session = await readSession();
  if (!session)
    return Response.json({ error: "unauthorised" }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 11 * 1024 * 1024)
    return Response.json({ error: "too_big" }, { status: 413 });

  const { url, publishableKey } = requireSupabaseEnv();
  const res = await fetch(`${url}/functions/v1/upload-credential-file`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "x-preboarding-session": session,
    },
    body: await request.formData(),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
