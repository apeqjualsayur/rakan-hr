import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { CandidateBoard, type BoardCandidate } from "./CandidateBoard";

export async function generateMetadata() {
  const t = await getTranslations("Hiring");
  return { title: t("title") };
}

// HIR-02 pipeline: Applied → Interview → Offer → Hired / Rejected, filterable by opening.
export default async function HiringPage() {
  const member = await requireMember(ADMIN_ROLES);
  const supabase = await createClient();
  const [{ data: candidates }, { data: openings }] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, job_opening_id, stage, stage_changed_at, offer_accepted_at, preboarding_submitted_at",
      )
      .order("stage_changed_at", { ascending: false })
      .returns<BoardCandidate[]>(),
    supabase
      .from("job_openings")
      .select("id, title, status")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <CandidateBoard
      candidates={candidates ?? []}
      openings={(openings ?? []).map((o) => ({
        id: o.id as string,
        title: o.title as string,
        status: o.status as string,
      }))}
      canAdd={can(member.role, "manageHiring")}
    />
  );
}
