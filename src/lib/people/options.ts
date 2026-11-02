import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmploymentRecord } from "./records";

/** Choices for the job fields: roles, branches, possible managers, usual hours. */
export async function loadJobOptions(
  supabase: SupabaseClient,
  exceptId?: string,
) {
  const [
    { data: roles },
    { data: branches },
    { data: people },
    { data: latest },
  ] = await Promise.all([
    supabase
      .from("job_roles")
      .select("id, name, is_clinical")
      .order("sort_order"),
    supabase.from("branches").select("id, name").order("created_at"),
    supabase
      .from("employees")
      .select("id, full_name")
      .is("deleted_at", null)
      .neq("status", "left")
      .order("full_name"),
    // The most recent contract's hours and days: the company's usual work pattern.
    supabase
      .from("employment_records")
      .select("normal_hours_per_day, work_days_per_week")
      .eq("is_current", true)
      .eq("employment_type", "full_time")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<
        Pick<EmploymentRecord, "normal_hours_per_day" | "work_days_per_week">
      >(),
  ]);
  return {
    roles: (roles ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      is_clinical: Boolean(r.is_clinical),
    })),
    branches: (branches ?? []).map((b) => ({
      id: b.id as string,
      name: (b.name as string | null) ?? null,
    })),
    managers: (people ?? [])
      .filter((p) => p.id !== exceptId)
      .map((p) => ({ id: p.id as string, name: p.full_name as string })),
    defaults: latest ?? undefined,
  };
}
