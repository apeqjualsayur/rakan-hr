import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { malaysiaToday } from "@/lib/format";
import {
  EMPLOYMENT_COLUMNS,
  type EmploymentRecord,
} from "@/lib/people/records";
import { probationState } from "./logic";
import { REVIEW_COLUMNS, type ProbationReview } from "./types";

/** HIR-07: someone's current contract, reviews (newest first) and where probation stands. */
export async function loadProbation(
  supabase: SupabaseClient,
  employeeId: string,
) {
  const [{ data: record }, { data: reviews }] = await Promise.all([
    supabase
      .from("employment_records")
      .select(EMPLOYMENT_COLUMNS)
      .eq("employee_id", employeeId)
      .eq("is_current", true)
      .maybeSingle<EmploymentRecord>(),
    supabase
      .from("probation_reviews")
      .select(REVIEW_COLUMNS)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .returns<ProbationReview[]>(),
  ]);
  const list = reviews ?? [];
  const reviewerIds = [
    ...new Set(list.map((r) => r.reviewer_id).filter(Boolean)),
  ] as string[];
  // Reviewers are named from their employee records where the reader can see them.
  const { data: reviewers } = reviewerIds.length
    ? await supabase
        .from("employees")
        .select("user_id, full_name")
        .in("user_id", reviewerIds)
    : { data: [] };
  const names = new Map(
    (reviewers ?? []).map((r) => [r.user_id as string, r.full_name as string]),
  );
  const today = malaysiaToday();
  return {
    record: record ?? null,
    reviews: list,
    reviewerName: (id: string | null) => (id ? (names.get(id) ?? null) : null),
    today,
    ...probationState(record ?? null, list[0] ?? null, today),
  };
}
