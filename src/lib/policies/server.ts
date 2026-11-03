import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedItem } from "@/components/policies/AnnouncementFeed";
import type { CurrentMember } from "@/lib/auth/member";
import {
  ANNOUNCEMENT_COLUMNS,
  POLICY_COLUMNS,
  SIGNATURE_COLUMNS,
  type Announcement,
  type PolicyDocument,
  type Signature,
} from "./types";

/**
 * Published announcements the viewer may see (RLS: audience), pinned first, with whether
 * they have read each. Admin roles see scheduled ones only on the management page.
 */
export async function loadFeed(
  supabase: SupabaseClient,
  userId: string,
  limit?: number,
): Promise<FeedItem[]> {
  let query = supabase
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .lte("publish_at", new Date().toISOString())
    .order("pinned", { ascending: false })
    .order("publish_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const [{ data }, { data: reads }] = await Promise.all([
    query.returns<Announcement[]>(),
    supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", userId),
  ]);
  const read = new Set((reads ?? []).map((r) => r.announcement_id as string));
  return (data ?? []).map((a) => ({ ...a, read: read.has(a.id) }));
}

/** Current policy versions the signed-in user still has to sign. */
export async function pendingPolicies(supabase: SupabaseClient) {
  const { data } = await supabase.rpc("my_pending_policies");
  return (data ?? []) as PolicyDocument[];
}

/** Everything the click-to-sign page needs for one policy version. */
export async function loadSignable(
  supabase: SupabaseClient,
  member: CurrentMember,
  policyId: string,
) {
  const [{ data: doc }, { data: signature }, { data: employee }] =
    await Promise.all([
      supabase
        .from("policy_documents")
        .select(POLICY_COLUMNS)
        .eq("id", policyId)
        .maybeSingle<PolicyDocument>(),
      supabase
        .from("signatures")
        .select(SIGNATURE_COLUMNS)
        .eq("entity_type", "policy_document")
        .eq("entity_id", policyId)
        .eq("signer_user_id", member.userId!)
        .maybeSingle<Signature>(),
      member.employeeId
        ? supabase
            .from("employees")
            .select("full_name")
            .eq("id", member.employeeId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  if (!doc) return null;
  const { data: url } = await supabase.storage
    .from("policies")
    .createSignedUrl(doc.file_path, 300);
  return {
    doc,
    signature,
    pdfUrl: url?.signedUrl ?? null,
    expectedName: (employee?.full_name as string | undefined) ?? null,
  };
}
